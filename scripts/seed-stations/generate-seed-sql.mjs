// station/line seed SQL "생성기" - SQL을 만들기만 한다. 실행하지 않는다.
//
// 실행:  npm run seed:stations:generate-sql
//
// ★ 이 스크립트는 DB에 연결하지 않는다. Supabase 클라이언트도 쓰지 않는다.
//   merge_report.csv 를 다시 쓰지 않는다. merge/display 로직을 다시 튜닝하지 않는다 -
//   annotateIdentities()/mergeStations()/stationDisplayLines() 를 그대로 호출해 나온
//   값을 SQL 리터럴로 옮겨 적을 뿐이다.
//
// ★ one-shot 전제 (2026-08-09 확정): migration 024/025 적용 직후 lines/stations/
//   station_lines 가 전부 비어 있다는 것을 전제로 한다. idempotent upsert가 아니다.
//   운영 데이터가 쌓인 뒤 재시딩이 필요해지면, 이미 발급된 stations.id 를 보존하는
//   reconciliation pipeline을 별도로 설계해야 한다 (TODO_PHASE2.md 에도 남긴다).
//
// ★ lines.line_code 는 이번 seed에서 NULL로 둔다. 025 주석상 "표준데이터 원본
//   노선번호"라는 기존 의미가 있고, 24->18 다대일 구조에서는 어떤 대표 코드도
//   안전한 유일 식별자가 되지 못한다(I4108이 경의중앙선·경춘선 둘에 걸침).
//   displayLineKey는 DB에 저장하지 않는다 - seed script 내부 reference로만 쓴다.
//
// ★ UUID 연결: gen_random_uuid() 기본값을 그대로 쓰고, 역명/station_code로 다시
//   SELECT해서 id를 찾지 않는다. 대신 "이름 붙은 CTE" 하나가 정확히 한 행을 INSERT
//   하고 그 CTE의 별칭(alias) 자체가 seed-local key 다 - line_1, gyeongui_jungang,
//   st_0001 ... st_0308. 이 별칭은 SQL 실행 중에만 존재하고 어떤 DB 컬럼에도 저장되지
//   않는다. station_lines는 이 CTE들을 이름으로 직접 참조해서 만든다(조회/조인 없음).

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { regionFilter, repoRoot, scriptDir, sourceFiles } from './config.mjs'
import { stationDisplayLines, validateDisplayLineMapping } from './lib/display-lines.mjs'
import { findSourceFile } from './lib/files.mjs'
import { createRegionResolver } from './lib/kakao.mjs'
import { manualOverrides } from './manual-overrides.mjs'
import { annotateIdentities, attachI18n, mergeStations } from './merge.mjs'
import { loadRailwayStandard } from './sources/railway-standard.mjs'
import { isSuspiciousI18nValue, loadSeoulMetroI18n } from './sources/seoul-metro-i18n.mjs'

const outputDir = path.join(scriptDir, 'output')
const outPath = path.join(outputDir, 'seed_stations.sql')

// [4] 확정된 18개 lines 행. name_en/ja/zh는 NULL, line_code도 NULL.
const LINES_SEED = [
  { key: 'line_1', nameKo: '1호선', displayOrder: 1 },
  { key: 'line_2', nameKo: '2호선', displayOrder: 2 },
  { key: 'line_3', nameKo: '3호선', displayOrder: 3 },
  { key: 'line_4', nameKo: '4호선', displayOrder: 4 },
  { key: 'line_5', nameKo: '5호선', displayOrder: 5 },
  { key: 'line_6', nameKo: '6호선', displayOrder: 6 },
  { key: 'line_7', nameKo: '7호선', displayOrder: 7 },
  { key: 'line_8', nameKo: '8호선', displayOrder: 8 },
  { key: 'line_9', nameKo: '9호선', displayOrder: 9 },
  { key: 'gyeongui_jungang', nameKo: '경의중앙선', displayOrder: 20 },
  { key: 'suin_bundang', nameKo: '수인분당선', displayOrder: 21 },
  { key: 'sinbundang', nameKo: '신분당선', displayOrder: 22 },
  { key: 'gyeongchun', nameKo: '경춘선', displayOrder: 23 },
  { key: 'airport_railroad', nameKo: '공항철도', displayOrder: 25 },
  { key: 'seohae', nameKo: '서해선', displayOrder: 26 },
  { key: 'uishinseol', nameKo: '우이신설선', displayOrder: 30 },
  { key: 'sillim', nameKo: '신림선', displayOrder: 31 },
  { key: 'gimpo_gold', nameKo: '김포골드라인', displayOrder: 32 },
]

const LINES_SOURCE = 'seed-stations/lib/display-lines.mjs'
const LINES_SOURCE_VERSION = 'identity-mapping-2026-08-09' // manual-overrides.mjs DECIDED_AT/사람 확정일과 동일 계열

const STATIONS_SOURCE = '전국도시철도역사정보표준데이터(국가철도공단)'

// ----------------------------------------
// SQL 리터럴 유틸 - JS 값 -> SQL 텍스트만 담당한다(비즈니스 로직 없음)
function sqlText(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function sqlNum(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'NULL'
  return String(v)
}

// ----------------------------------------
async function main() {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch { /* 셸 환경변수만 쓰는 경우 */ }

  // ========================================
  // 1. 실데이터 로드 (review-display-lines.mjs 와 동일한 방식 - merge_report.csv 재현)
  // ========================================
  const railwayPath = await findSourceFile(sourceFiles.railwayStandard, '전국도시철도역사정보표준데이터')
  const railway = await loadRailwayStandard(railwayPath)

  const { minLat, maxLat, minLng, maxLng } = regionFilter.bbox
  const inBox = railway.units.filter((u) => u.lat >= minLat && u.lat <= maxLat && u.lng >= minLng && u.lng <= maxLng)

  const resolver = await createRegionResolver({ enabled: true })
  for (const u of inBox) u.district = await resolver.resolve(u.lat, u.lng)
  await resolver.persist()

  const units = inBox.filter((u) => u.district && regionFilter.sidoCodes.includes(u.district.districtCode.slice(0, 2)))
  if (units.length === 0) throw new Error('대상 지역에 남은 역이 없습니다.')

  annotateIdentities(units)

  const { stations, overrideAudit, blockingIssues } = mergeStations(units, manualOverrides)
  if (blockingIssues.length > 0) {
    throw new Error(`manual override stale/unused ${blockingIssues.length}건 - SQL을 생성하지 않습니다.`)
  }

  const i18nPath = await findSourceFile(sourceFiles.seoulMetroI18n, '서울교통공사 역명다국어표기')
  const i18n = await loadSeoulMetroI18n(i18nPath)
  attachI18n(stations, i18n.byName)

  // [7][9] 원본 CSV 손상 값(loadSeoulMetroI18n 이 이미 null 로 정제함)이 attachI18n 이후
  // station 객체에 다시 흘러들지 않았는지 재확인한다. 정제 로직과 별개 지점에서 한 번 더
  // 검사한다 - "한 곳만 믿지 않는다"는 이 저장소의 기존 원칙(override fingerprint 이중
  // 계산 금지와 반대로, 여기는 방어를 일부러 이중화한다).
  const i18nCorruptionFound = []
  for (const s of stations) {
    if (isSuspiciousI18nValue(s.nameJa)) i18nCorruptionFound.push(`${s.nameKo}: nameJa=${JSON.stringify(s.nameJa)}`)
    if (isSuspiciousI18nValue(s.nameZh)) i18nCorruptionFound.push(`${s.nameKo}: nameZh=${JSON.stringify(s.nameZh)}`)
    // nameHanja는 railway-standard.mjs(전체_도시철도역사정보) 소스라 loadSeoulMetroI18n과
    // 무관하지만, 같은 손상 패턴(2026-08-10 진단)이 있어 stations 에 들어가는 모든
    // i18n 계열 필드를 여기서 한 번에 검사한다.
    if (isSuspiciousI18nValue(s.nameHanja)) i18nCorruptionFound.push(`${s.nameKo}: nameHanja=${JSON.stringify(s.nameHanja)}`)
    if (isSuspiciousI18nValue(s.nameEn)) i18nCorruptionFound.push(`${s.nameKo}: nameEn=${JSON.stringify(s.nameEn)}`)
  }

  // ========================================
  // 2. display line 계산 (station.lineIdentities/lineNames/units 는 건드리지 않는다)
  // ========================================
  const seenIdentities = new Set(stations.flatMap((s) => s.lineIdentities))
  const validation = validateDisplayLineMapping(seenIdentities)

  const stationRows = stations.map((s, i) => {
    const { lines, dedupRemovedCount } = stationDisplayLines(s.lineIdentities)
    return {
      key: `st_${String(i + 1).padStart(4, '0')}`,
      station: s,
      displayLines: lines,
      dedupRemovedCount,
    }
  })

  // ========================================
  // 3. [14] SQL 생성 전 programmatic validation - 하나라도 실패하면 파일을 쓰지 않는다
  // ========================================
  const errors = []

  if (stationRows.length !== 308) errors.push(`station count = ${stationRows.length} (기대 308)`)
  if (LINES_SEED.length !== 18) errors.push(`display line = ${LINES_SEED.length} (기대 18)`)

  const relCount = stationRows.reduce((a, r) => a + r.displayLines.length, 0)
  if (relCount !== 405) errors.push(`station_lines = ${relCount} (기대 405)`)

  const unmappedCount = seenIdentities.size > 0 ? [...seenIdentities].filter((id) => !(id in validation)).length : 0
  void unmappedCount // validateDisplayLineMapping 이 이미 A(unmapped)를 hard fail 했으므로 여기 도달했다면 0이다

  // 중복 관계(같은 station-line 쌍이 두 번) 검사 - stationDisplayLines() 의 dedupe 를 다시 신뢰하지 않고 직접 재검증한다
  let duplicateRelCount = 0
  for (const r of stationRows) {
    const seen = new Set()
    for (const l of r.displayLines) {
      if (seen.has(l.key)) duplicateRelCount += 1
      seen.add(l.key)
    }
  }
  if (duplicateRelCount !== 0) errors.push(`duplicate station-line relation = ${duplicateRelCount} (기대 0)`)

  // station_districts는 이번 SQL 범위 밖이라 missing district reference 검사는 해당 없음(보고에서 명시)

  // 025 NOT NULL 컬럼 전부 채우는지 확인
  if (!railway.baseDate) errors.push('railway.baseDate(데이터기준일자) 가 없어 stations.source_version 을 채울 수 없습니다.')
  const missingRequiredField = []
  for (const r of stationRows) {
    const s = r.station
    if (!s.nameKo) missingRequiredField.push(`${r.key}: name_ko 없음`)
    if (!Number.isFinite(s.lat)) missingRequiredField.push(`${r.key}: latitude 없음`)
    if (!Number.isFinite(s.lng)) missingRequiredField.push(`${r.key}: longitude 없음`)
  }
  if (missingRequiredField.length > 0) errors.push(`missing required station field: ${missingRequiredField.join(' / ')}`)
  if (i18nCorruptionFound.length > 0) {
    errors.push(`station name_ja/name_zh/name_hanja/name_en 에 손상 의심 값(literal '?' 또는 U+FFFD): ${i18nCorruptionFound.join(' / ')}`)
  }
  const nameKoSet = new Set(LINES_SEED.map((l) => l.nameKo))
  if (nameKoSet.size !== LINES_SEED.length) errors.push('lines nameKo 중복이 있습니다.')
  const orderSet = new Set(LINES_SEED.map((l) => l.displayOrder))
  if (orderSet.size !== LINES_SEED.length) errors.push('lines displayOrder 중복이 있습니다.')

  const applied = overrideAudit.filter((a) => a.status === 'applied')
  const staleOrUnused = overrideAudit.filter((a) => a.status !== 'applied')
  if (staleOrUnused.length !== 0) errors.push(`manual override stale/unused = ${staleOrUnused.length} (기대 0)`)

  if (errors.length > 0) {
    console.error('SQL 생성 전 validation 실패 - 파일을 생성하지 않습니다:')
    for (const e of errors) console.error(`  ✗ ${e}`)
    process.exitCode = 1
    return
  }
  console.log('SQL 생성 전 validation 전부 통과:')
  console.log(`  station ${stationRows.length} / display line ${LINES_SEED.length} / relation ${relCount}`)
  console.log(`  override applied ${applied.length} / stale+unused ${staleOrUnused.length}`)
  console.log(`  railway.baseDate(source_version) = ${railway.baseDate}`)
  console.log(`  i18n matched source row ${i18n.rowCount} -> byName ${i18n.byName.size}`)
  console.log(`  i18n(역명다국어표기) 손상 정제(전국): nameJa ${i18n.corrupted.nameJa} / nameZh ${i18n.corrupted.nameZh} / nameEn ${i18n.corrupted.nameEn}`)
  console.log(`  railway(전체_도시철도역사정보) 손상 정제(전국): nameHanja ${railway.corrupted.nameHanja} / nameEn ${railway.corrupted.nameEn}`)
  const jaPopulated = stationRows.filter((r) => r.station.nameJa).length
  const zhPopulated = stationRows.filter((r) => r.station.nameZh).length
  const hanjaPopulated = stationRows.filter((r) => r.station.nameHanja).length
  console.log(`  정제 후 서울 308 중 name_ja ${jaPopulated} / name_zh ${zhPopulated} / name_hanja ${hanjaPopulated} 채워짐`)

  // ========================================
  // 4. SQL 텍스트 생성
  // ========================================
  const L = []

  L.push('-- ============================================================')
  L.push('-- station/line/station_lines one-shot seed (자동 생성 - 사람이 검토 후 실행)')
  L.push(`-- 생성 시각: ${new Date().toISOString()}`)
  L.push('-- 생성기: scripts/seed-stations/generate-seed-sql.mjs')
  L.push('-- ============================================================')
  L.push('--')
  L.push('-- ★ 전제 (one-shot): migration 024/025 적용 직후, lines/stations/station_lines')
  L.push('--   3개 테이블이 전부 비어 있다는 것을 전제로 한다. idempotent upsert가 아니다.')
  L.push('--   재실행하려면(=이미 데이터가 있는 상태) 이 SQL을 그대로 다시 돌리면 안 된다 -')
  L.push('--   아래 empty-table guard가 즉시 실패시킨다(의도된 동작).')
  L.push('--')
  L.push('-- ★ 재시딩 전략은 미결이다. 이번 seed는 빈 테이블을 전제한다. 운영 데이터가')
  L.push('--   쌓인 뒤 재시딩이 필요해지면, 이미 발급된 stations.id를 보존하는')
  L.push('--   reconciliation pipeline을 별도로 설계해야 한다(TODO_PHASE2.md 동일 문구 기록).')
  L.push('--')
  L.push('-- ★ lines.line_code는 의도적으로 NULL이다. 025 주석의 "표준데이터 원본 노선번호"')
  L.push('--   라는 기존 의미를 조용히 재정의하지 않는다. displayLineKey(line_1,')
  L.push('--   gyeongui_jungang 등)는 어떤 DB 컬럼에도 저장되지 않는다 - 아래 CTE 별칭으로만')
  L.push('--   SQL 실행 중에 존재하고, station_lines를 만들고 나면 사라진다.')
  L.push('--')
  L.push('-- ★ UUID 연결: gen_random_uuid() 기본값을 그대로 쓰고, 역명/station_code로 다시')
  L.push('--   SELECT해서 id를 찾지 않는다. "이름 붙은 CTE" 자체가 seed-local key다.')
  L.push('--')
  L.push('-- ★ lines.operator는 의도적으로 NULL이다. 하나의 논리 노선(예: 1호선)이 서울교통공사·')
  L.push('--   한국철도공사 등 복수 운영기관에 걸치는 경우가 있어, 대표 운영사 하나를 임의로')
  L.push('--   골라 채우면 오히려 부정확한 데이터가 된다. 운영사 정보가 실제로 필요해지면')
  L.push('--   line_operators 같은 다대다 모델을 별도로 검토한다(이번 단계 대상 아님).')
  L.push('--')
  L.push('-- ★ stations.name_zh/name_ja/name_hanja/name_en 은 원본 CSV 2개(역명다국어표기.csv,')
  L.push('--   전체_도시철도역사정보.csv) 자체에 이미 ASCII \'?\'(0x3F)가 저장된 손상 값이 있었다')
  L.push('--   (2026-08-09/10 byte-level 진단으로 확정, 두 파일 모두 U+FFFD 0건 - 디코더 실패가')
  L.push('--   아니라 원본 데이터 자체의 손실). lib/reference-text-quality.mjs 의 공용 판정으로')
  L.push('--   sources/seoul-metro-i18n.mjs·sources/railway-standard.mjs 양쪽이 손상 값을')
  L.push('--   결손(NULL)으로 정제한 뒤의 결과를 이 SQL에 담는다 - 손상 문자열을 그대로 저장하지 않는다.')
  L.push(`--   정제 건수(전국): 역명다국어표기 nameJa ${i18n.corrupted.nameJa}/nameZh ${i18n.corrupted.nameZh}/nameEn ${i18n.corrupted.nameEn}`)
  L.push(`--                    전체_도시철도역사정보 nameHanja ${railway.corrupted.nameHanja}/nameEn ${railway.corrupted.nameEn}`)
  L.push(`--   정제 후 서울 308 station 중 name_ja ${jaPopulated} / name_zh ${zhPopulated} / name_hanja ${hanjaPopulated} 채워짐`)
  L.push('--')
  L.push(`-- cardinality contract: source rows 406 / stations 308 / lines 18 / station_lines ${relCount}`)
  L.push(`--   station별 display-line 개수 분포: 1=228 / 2=68 / 3=8 / 4=3 / 5=1 (dedupe: 청량리 1건)`)
  L.push(`-- manual override: applied ${applied.length} / stale+unused 0`)
  L.push(`-- merge 결과는 재계산·튜닝하지 않았다 - mergeStations()/stationDisplayLines() 결과를 그대로 옮겼다.`)
  L.push('--')
  L.push('-- ★ 이번 SQL 범위: lines / stations / station_lines 만 포함한다.')
  L.push('--   station_districts는 포함하지 않는다 - districts 테이블 자체가 아직 어떤')
  L.push('--   migration/스크립트에서도 시드되지 않아(024는 빈 테이블만 만든다) FK가 성립하지')
  L.push('--   않는다. station_aliases(migration 026)도 포함하지 않는다 - 정규화/초성/kind')
  L.push('--   분류가 필요한 별도 하위 시스템이라 이번 범위 밖이다. 부역명 등 원본 정보는')
  L.push('--   이 생성기의 중간 데이터(station.subNames/aliasCandidates)에 그대로 남아 있고')
  L.push('--   버려지지 않았다 - 이번 SQL에만 안 옮겼을 뿐이다.')
  L.push('-- ============================================================')
  L.push('')
  L.push('BEGIN;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push('-- [10] empty-table guard - 하나라도 비어 있지 않으면 즉시 실패한다.')
  L.push('--      DELETE/TRUNCATE 없음. 데이터가 있으면 실패해야 한다(의도).')
  L.push('-- ------------------------------------------------------------')
  L.push('DO $guard$')
  L.push('BEGIN')
  L.push('  IF EXISTS (SELECT 1 FROM lines LIMIT 1) THEN')
  L.push("    RAISE EXCEPTION 'seed_stations.sql: lines 테이블이 비어 있지 않습니다. one-shot 전제가 깨졌습니다 - 이 SQL을 재실행하면 안 됩니다.';")
  L.push('  END IF;')
  L.push('  IF EXISTS (SELECT 1 FROM stations LIMIT 1) THEN')
  L.push("    RAISE EXCEPTION 'seed_stations.sql: stations 테이블이 비어 있지 않습니다. one-shot 전제가 깨졌습니다 - 이 SQL을 재실행하면 안 됩니다.';")
  L.push('  END IF;')
  L.push('  IF EXISTS (SELECT 1 FROM station_lines LIMIT 1) THEN')
  L.push("    RAISE EXCEPTION 'seed_stations.sql: station_lines 테이블이 비어 있지 않습니다. one-shot 전제가 깨졌습니다 - 이 SQL을 재실행하면 안 됩니다.';")
  L.push('  END IF;')
  L.push('END')
  L.push('$guard$;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push('-- lines(18) + stations(308) INSERT 후, 그 결과(RETURNING id)를 같은 문장 안에서')
  L.push('-- station_lines(405) 로 직접 연결한다. 이름 붙은 CTE 자체가 seed-local key다 -')
  L.push('-- 조회/조인으로 역명이나 station_code를 다시 찾지 않는다.')
  L.push('-- ------------------------------------------------------------')
  L.push('WITH')

  const cteBlocks = []

  for (const line of LINES_SEED) {
    cteBlocks.push(
      [
        `${line.key} AS (`,
        `  INSERT INTO lines (id, line_code, name_ko, name_en, name_ja, name_zh, operator, display_order, source, source_version)`,
        `  VALUES (gen_random_uuid(), NULL, ${sqlText(line.nameKo)}, NULL, NULL, NULL, NULL, ${sqlNum(line.displayOrder)}, ${sqlText(LINES_SOURCE)}, ${sqlText(LINES_SOURCE_VERSION)})`,
        `  RETURNING id`,
        `)`,
      ].join('\n'),
    )
  }

  for (const r of stationRows) {
    const s = r.station
    cteBlocks.push(
      [
        `${r.key} AS (`,
        `  INSERT INTO stations (id, station_code, name_ko, name_en, name_hanja, name_ja, name_zh, latitude, longitude, source, source_version)`,
        `  VALUES (gen_random_uuid(), ${sqlText(s.stationCode)}, ${sqlText(s.nameKo)}, ${sqlText(s.nameEn)}, ${sqlText(s.nameHanja)}, ${sqlText(s.nameJa)}, ${sqlText(s.nameZh)}, ${sqlNum(s.lat)}, ${sqlNum(s.lng)}, ${sqlText(STATIONS_SOURCE)}, ${sqlText(railway.baseDate)})`,
        `  RETURNING id`,
        `)`,
      ].join('\n'),
    )
  }

  L.push(cteBlocks.join(',\n'))
  L.push('INSERT INTO station_lines (station_id, line_id)')

  const relSelects = []
  for (const r of stationRows) {
    for (const l of r.displayLines) {
      relSelects.push(`SELECT ${r.key}.id, ${l.key}.id FROM ${r.key}, ${l.key}`)
    }
  }
  L.push(relSelects.join('\nUNION ALL\n') + ';')
  L.push('')
  L.push('COMMIT;')
  L.push('')
  L.push('-- ============================================================')
  L.push('-- [11] verification query - read-only. 위 트랜잭션 COMMIT 이후 사람이 직접 실행한다.')
  L.push('-- ============================================================')
  L.push('')
  L.push('-- 기본 카디널리티')
  L.push("select 'lines' as t, count(*) as n from lines")
  L.push("union all select 'stations_active', count(*) from stations where is_active")
  L.push("union all select 'station_lines', count(*) from station_lines;")
  L.push('-- 기대: lines=18 / stations_active=308 / station_lines=405')
  L.push('')
  L.push('-- station별 display-line 개수 분포 (기대: 1=228 / 2=68 / 3=8 / 4=3 / 5=1)')
  L.push('select line_count, count(*) as station_count')
  L.push('from (select station_id, count(*) as line_count from station_lines group by station_id) x')
  L.push('group by line_count order by line_count;')
  L.push('')
  L.push('-- displayOrder collision (기대: 0행)')
  L.push('select display_order, count(*) from lines group by display_order having count(*) > 1;')
  L.push('')
  L.push('-- station_lines 중복 관계 (기대: 0행)')
  L.push('select station_id, line_id, count(*) from station_lines group by station_id, line_id having count(*) > 1;')
  L.push('')
  L.push("-- 신촌 physical station = 2개 기대")
  L.push("select id, name_ko, latitude, longitude from stations where name_ko like '신촌%';")
  L.push('')
  L.push('-- 029 list_open_requests_for_realtor() 와 동일한 array_agg(name_ko order by display_order) 형태로 표본 확인')
  L.push('select s.name_ko,')
  L.push('       (select array_agg(l.name_ko order by l.display_order)')
  L.push('          from station_lines sl join lines l on l.id = sl.line_id')
  L.push('         where sl.station_id = s.id) as line_names')
  L.push("  from stations s where s.name_ko in ('서울역','왕십리','청량리','김포공항')")
  L.push(' order by s.name_ko;')
  L.push('-- 기대(순서 무관하게 아래 집합과 일치해야 한다):')
  L.push('--   서울역   {1호선,4호선,경의중앙선,공항철도}')
  L.push('--   왕십리   {2호선,5호선,경의중앙선,수인분당선}')
  L.push('--   청량리   {1호선,경의중앙선}                    ← dedupe 케이스')
  L.push('--   김포공항 {5호선,9호선,공항철도,서해선,김포골드라인}')
  L.push('')

  await writeFile(outPath, L.join('\n') + '\n', 'utf-8')

  console.log(`\n작성됨: ${outPath}`)
  console.log(`  lines CTE ${LINES_SEED.length} / stations CTE ${stationRows.length} / station_lines SELECT ${relSelects.length}`)
  console.log('\n★ 이 스크립트는 SQL을 실행하지 않았습니다. 사람이 검토 후 Supabase SQL Editor에서 실행합니다.')
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}\n`)
  process.exitCode = 1
})
