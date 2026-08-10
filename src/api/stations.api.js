import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { normalizeStationQuery } from '../shared/stationSearch/normalizeStationQuery'

// 역 검색(autocomplete). station_aliases prefix 매칭 -> station 단위로 접어서 반환한다.
//
// ★ 정규화는 src/shared/stationSearch/normalizeStationQuery.js 를 그대로 쓴다.
//   시드 생성기가 alias_normalized 를 만들 때 쓴 것과 같은 파일이다. 프론트 전용 복사본을
//   만들면 그 순간부터 저장값과 조회값이 갈릴 수 있다(migration_026:55-56).
//
// ★ 새 RPC 를 만들지 않는다. 026/025/024 가 이미 anon SELECT 를 허용하므로
//   station_aliases -> stations -> station_lines -> lines 임베드 한 번이면 된다.

// station 하나당 카드 하나를 만들기 위해 넉넉히 받아 온 뒤 접는다.
// 한 역에 별칭이 최대 6개(official 4 + chosung + legacy) 붙으므로 8개 카드를 채우려면
// 이 정도 여유가 필요하다. 초성 1글자처럼 매칭이 아주 넓은 입력도 여기서 잘린다.
const FETCH_LIMIT = 120

/** 매칭 품질 등급. 낮을수록 위에 온다. */
const RANK = {
  EXACT_NAME: 0,        // 입력이 역명과 글자 그대로 같다        '신촌' -> 신촌(2호선)
  EXACT_NAME_NORMALIZED: 1, // 정규화 후 역명과 같다             '신촌' -> 신촌역(경의중앙선)
  EXACT_ALIAS: 2,       // 정규화 후 어떤 별칭과 같다            'ㅎㄷ' -> 학동/행당
  PREFIX: 3,            // 별칭의 앞부분과 같다                  '홍대' -> 홍대입구
}

/**
 * LIKE 패턴에 쓸 수 없는 와일드카드 문자를 없앤다.
 *
 * PostgREST 의 like 필터에는 ESCAPE 절을 붙일 수 없다. 정규화 규칙(026)이 %와 _를
 * 지우지 않으므로 사용자가 치면 그대로 남아 와일드카드로 동작한다.
 * 역명에 등장하지 않는 문자라 지워도 검색 결과가 나빠지지 않는다.
 */
function stripWildcards(text) {
  return text.replace(/[%_]/g, '')
}

function lineNamesOf(station) {
  return (station?.station_lines ?? [])
    .map((sl) => sl.lines)
    .filter(Boolean)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((l) => l.name_ko)
}

/**
 * 역을 검색한다.
 *
 * @param {string} rawInput 사용자가 입력한 원문
 * @param {{ limit?: number, signal?: AbortSignal }} options
 * @returns {Promise<{ data: Array|null, error: string|null, normalized: string }>}
 *   data 원소: { stationId, nameKo, lineNames: string[], districtCode, rank, matchedAlias }
 */
export async function searchStations(rawInput, { limit = 8, signal } = {}) {
  const normalized = stripWildcards(normalizeStationQuery(rawInput ?? '') ?? '')
  if (!normalized) return { data: [], error: null, normalized: '' }

  let query = supabase
    .from('station_aliases')
    .select(
      'station_id, alias, alias_normalized, kind, lang,' +
        ' stations(id, name_ko, station_districts(district_code, is_primary),' +
        ' station_lines(lines(name_ko, display_order)))',
    )
    .like('alias_normalized', `${normalized}%`)
    .limit(FETCH_LIMIT)

  if (signal) query = query.abortSignal(signal)

  const { data, error } = await query
  if (error) {
    // AbortError 는 호출부가 최신 요청으로 교체한 정상 흐름이다. 화면에 에러를 띄우지 않는다.
    if (error.name === 'AbortError' || signal?.aborted) {
      return { data: null, error: null, normalized, aborted: true }
    }
    return { data: null, error: toFriendlyError(error), normalized }
  }

  // station 단위로 접는다. 같은 역이 여러 별칭으로 걸려도 카드는 하나다.
  const byStation = new Map()
  for (const row of data ?? []) {
    const station = row.stations
    if (!station) continue

    const nameNormalized = normalizeStationQuery(station.name_ko) ?? ''
    let rank
    if (station.name_ko === rawInput.trim()) rank = RANK.EXACT_NAME
    else if (nameNormalized === normalized) rank = RANK.EXACT_NAME_NORMALIZED
    else if (row.alias_normalized === normalized) rank = RANK.EXACT_ALIAS
    else rank = RANK.PREFIX

    const prev = byStation.get(row.station_id)
    if (prev && prev.rank <= rank) continue

    byStation.set(row.station_id, {
      stationId: row.station_id,
      nameKo: station.name_ko,
      lineNames: lineNamesOf(station),
      districtCode: (station.station_districts ?? []).find((d) => d.is_primary)?.district_code ?? null,
      rank,
      matchedAlias: row.alias,
      nameNormalized,
    })
  }

  // 등급 -> 이름 길이 -> 이름 순. 역명을 하드코딩하지 않고 규칙만으로 순서를 정한다.
  //   '신촌' 검색: 신촌(글자 그대로 일치, 등급 0) 이 신촌역(정규화 후 일치, 등급 1) 보다 앞에 온다.
  const sorted = [...byStation.values()].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.nameNormalized.length !== b.nameNormalized.length) return a.nameNormalized.length - b.nameNormalized.length
    return a.nameKo.localeCompare(b.nameKo, 'ko')
  })

  return { data: sorted.slice(0, limit), error: null, normalized }
}
