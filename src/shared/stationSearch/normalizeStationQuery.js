// 역 검색 정규화 — alias 생성기(Node)와 autocomplete UI(Vite)가 함께 쓰는 단일 원본.
//
// ★ 이 파일이 검색의 계약이다. 복제본을 만들지 마라.
//   seed generator 가 station_aliases.alias_normalized 를 이 함수로 굽고,
//   프론트가 사용자 입력을 같은 함수로 정규화해서 prefix 로 비교한다.
//   한쪽만 바꾸면 검색이 조용히 깨진다.
//
// ★ DB 의 normalize_station_query() 와의 관계
//   migration_026 의 SQL 함수는 그대로 둔다(수정하지 않는다). 다만 autocomplete
//   critical path 에서는 쓰지 않는다. DB utility / 향후 서버측 검증용으로만 남긴다.
//   이 JS 가 SQL 보다 넓다 — 아래 [0] NFKC 단계가 SQL 에 없기 때문이다.
//   두 결과가 갈리는 입력은 CJK 호환 한자 등 사용자가 IME 로 칠 수 없는 문자에 한정된다.
//
// 처리 순서
//   [0] NFKC (한글 호환 자모는 보호)   ← SQL 에 없는 단계
//   [1] 전각 영숫자 -> 반각
//   [2] 가타카나 -> 히라가나
//   [3] 장음 부호(ー) / 나카구로(・) 제거
//   [4] 소문자화
//   [5] 공백 / 구두점 제거
//   [6] 끝의 역 접미사 제거 (역 | station | 駅 | 站)
//
// [1]~[6] 은 migration_026_station_mapping_search.sql 의 normalize_station_query() 와
// 같은 규칙이며 순서도 같다. 그쪽을 고치면 여기도 같이 고쳐야 한다.

// ---------------------------------------------------------------------------
// [0] NFKC — 왜 필요하고, 왜 통째로 걸면 안 되는가
//
//   필요한 이유: 원본 공공데이터의 한자 표기에 CJK 호환 한자(U+F900~U+FAFF)가 섞여 있다.
//     論(U+F941) 龍(U+F9C4) 梨(U+F9E2) ... 일반 한자와 글자 모양이 같지만 코드포인트가
//     다르다. 사용자가 IME 로 치는 것은 언제나 일반 한자(U+8AD6 등)이므로, 정규화하지
//     않으면 그 별칭은 영원히 검색되지 않는다.
//
//   ★ 통째로 걸면 안 되는 이유: 한글 호환 자모(U+3130~U+318F)가 조합용 자모로 바뀐다.
//       'ㅎㄷ'.normalize('NFKC') === 'ᄒᄃ'   (U+314E U+3103 -> U+1112 U+1103)
//     kind='chosung' 별칭이 바로 이 호환 자모다. 변환해 버리면 사용자가 IME 로 친 'ㅎㄷ'
//     와 저장값의 바이트가 갈려 초성 검색이 통째로 죽는다.
//     migration_026 확인 벡터 t15/t16 이 이 성질을 못박아 둔 것과 같은 이유다.
//
//   그래서 호환 자모 구간만 떼어 놓고 NFKC 를 건다. 조합용 자모(U+1100~U+11FF)는
//   보호 대상이 아니다 — 사용자가 NFD 로 분해된 한글을 붙여넣었을 때는 오히려
//   음절로 합쳐 주는 편이 맞다.
//   범위는 Hangul Compatibility Jamo 블록 전체(U+3130~U+318F)다.
//   리터럴 문자로 적으면 눈으로 구간을 확인할 수 없어 코드포인트로 쓴다.
const HANGUL_COMPAT_JAMO = /([\u3130-\u318F]+)/

/** 한글 호환 자모를 보존하면서 NFKC 를 적용한다. */
function nfkcPreservingCompatJamo(text) {
  // split 에 캡처 그룹이 있으면 구분자도 배열에 남는다. 홀수 인덱스가 보호 구간이다.
  return text
    .split(HANGUL_COMPAT_JAMO)
    .map((part, i) => (i % 2 === 1 ? part : part.normalize('NFKC')))
    .join('')
}

// ---------------------------------------------------------------------------
// [1] 전각 영숫자 -> 반각
const FULLWIDTH_FROM =
  '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ'
const FULLWIDTH_TO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// [2] 가타카나 -> 히라가나
const KATAKANA_FROM =
  'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ'
const KATAKANA_TO =
  'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ'

// [3] 제거 대상
const DROP_CHARS = 'ー・'

// PostgreSQL translate(string, from, to) 재현.
// to 가 짧으면 대응 문자가 없는 글자는 제거된다 — DROP_CHARS 가 이 성질을 쓴다.
function translate(text, from, to) {
  const map = new Map()
  const fromChars = Array.from(from)
  const toChars = Array.from(to)
  for (let i = 0; i < fromChars.length; i += 1) {
    if (map.has(fromChars[i])) continue // PG 는 from 의 첫 등장만 쓴다
    map.set(fromChars[i], i < toChars.length ? toChars[i] : '')
  }
  return Array.from(text)
    .map((ch) => (map.has(ch) ? map.get(ch) : ch))
    .join('')
}

// [5] 공백/구두점 제거.
//   POSIX [[:space:]] 를 그대로 맞춘다. JS 의 \s 는 U+00A0 등 유니코드 공백까지 잡아
//   SQL 쪽과 결과가 갈릴 수 있으므로 쓰지 않는다.
//   ※ 전각 공백 U+3000 은 [0] NFKC 가 반각 공백으로 바꾸므로 여기서 걸린다.
const PUNCT_RE = /[ \t\n\v\f\r'.,()·-]/g

// [6] 끝의 역 접미사 제거. 전역 치환이 아니라 끝 1회만이다(SQL 에 'g' 플래그가 없다).
const SUFFIX_RE = /(역|station|駅|站)$/

/** [1]~[6]. migration_026 의 normalize_station_query() 와 규칙도 순서도 같다. */
function applySqlRules(text) {
  let out = translate(text, FULLWIDTH_FROM, FULLWIDTH_TO)
  out = translate(out, KATAKANA_FROM, KATAKANA_TO)
  out = translate(out, DROP_CHARS, '')
  out = out.toLowerCase()
  out = out.replace(PUNCT_RE, '')
  out = out.replace(SUFFIX_RE, '')
  return out
}

/**
 * ★ 검색 계약. station_aliases.alias_normalized 생성과 사용자 입력 처리에 **둘 다** 이것을 쓴다.
 *
 * [0] NFKC(호환 자모 보호) + [1]~[6]. DB 의 normalize_station_query() 보다 넓다.
 * null/undefined 는 null 을 돌려준다(SQL strict 함수와 동일).
 */
export function normalizeStationQuery(text) {
  if (text === null || text === undefined) return null
  return applySqlRules(nfkcPreservingCompatJamo(String(text)))
}

/**
 * ★ DB 동등 계약. migration_026 의 normalize_station_query() 와 **정확히 같은 결과**를 낸다.
 *
 * 검색에 쓰지 마라. 용도는 하나다 — 시드 파이프라인의 병합 그룹핑 키(canonical_key).
 * 그 키는 현재 308 station master 를 만들어 낸 값이고, 여기에 NFKC 를 끼우면 재실행 시
 * 병합 결과가 달라질 수 있다. master 가 동결 상태이므로 이 함수는 동결이다.
 *
 * (실측: 원본 CSV + merge_report 의 고유 입력 9,143건 중 두 계약의 결과가 갈리는 것은 91건이며
 *  전부 한자/중국어 표기와 운영기관명이다. 한국어 역명은 0건이라 지금 당장은 병합 결과가
 *  같지만, 그 사실에 기대어 계약을 합치지 않는다.)
 */
export function normalizeStationQuerySqlParity(text) {
  if (text === null || text === undefined) return null
  return applySqlRules(String(text))
}

// ---------------------------------------------------------------------------
// 한글 초성 추출. migration_026 의 hangul_chosung() 과 같은 산술이다.
//   한글 음절 = 0xAC00 + (초성 * 588) + (중성 * 28) + 종성
// 한글 음절이 아닌 문자는 그대로 둔다.
//
// ★ 여기서 나오는 자모는 호환 자모(U+3131~U+314E)다. 사용자가 IME 로 치는 것과 같은
//   구간이며, 위 [0] 이 이 구간을 보호하는 이유가 이것이다.
const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'

export function hangulChosung(text) {
  if (text === null || text === undefined) return null
  return Array.from(String(text))
    .map((ch) => {
      const cp = ch.codePointAt(0)
      if (cp >= 44032 && cp <= 55203) return CHOSUNG[Math.floor((cp - 44032) / 588)]
      return ch
    })
    .join('')
}
