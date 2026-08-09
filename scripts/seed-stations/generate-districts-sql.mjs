// districts / station_districts seed SQL "생성기" - SQL을 만들기만 한다. 실행하지 않는다.
//
// 실행:  npm run seed:stations:generate-districts-sql
//
// ★ 이 스크립트는 DB에 연결하지 않는다. Supabase 클라이언트도 쓰지 않는다.
//   merge_report.csv 를 다시 쓰지 않고, 병합/표시 로직을 재튜닝하지 않는다.
//   annotateIdentities()/mergeStations() 를 그대로 호출해 나온 값을 SQL 리터럴로 옮길 뿐이다.
//
// ★ generate-seed-sql.mjs 를 고치지 않고 별도 생성기를 둔 이유:
//   그 파일은 이미 실행되어 DB에 반영된 산출물(lines 18 / stations 308 / station_lines 405)을
//   만든 코드다. 손대면 "무엇이 실행된 버전인지"가 흐려진다. 실행 시점도 다르다 -
//   저쪽은 완료됐고 이쪽은 026 적용 후에 실행한다.
//
// ★ DB 적용 순서 (2026-08-09 확정)
//     024 → 025 → 026 → seed_stations.sql → seed_districts.sql → DB 검증 → 027
//   026 이 seed 보다 먼저다 - 026 은 스키마만 만들어 행이 없어도 적용되고, 반대로
//   이 SQL 은 026 이 만드는 station_districts 테이블이 있어야 실행된다.
//
// ★ 앞선 seed 와 결정적으로 다른 점: stations 를 여기서 INSERT 하지 않는다.
//   이미 발급된 stations.id 를 그대로 쓴다. CTE 별칭으로 id 를 만들 수 없으므로
//   기존 행을 "찾아야" 한다 - [E] one-shot execution key 참고.
//
// ★ 이번 SQL 범위: districts / station_districts 만. station_aliases(026)는 포함하지 않는다.

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { regionFilter, repoRoot, scriptDir, sourceFiles } from './config.mjs'
import { districtCandidates, resolveDistrictHierarchy } from './lib/district-hierarchy.mjs'
import { findSourceFile } from './lib/files.mjs'
import { createRegionResolver } from './lib/kakao.mjs'
import { manualOverrides } from './manual-overrides.mjs'
import { annotateIdentities, mergeStations } from './merge.mjs'
import { loadLegalDongCode } from './sources/legal-dong-code.mjs'
import { loadRailwayStandard } from './sources/railway-standard.mjs'

const outputDir = path.join(scriptDir, 'output')
const outPath = path.join(outputDir, 'seed_districts.sql')

// ========================================
// [A] provenance - 파일에서 읽은 값이 아니라 정책으로 부여한 metadata 다.
//     그래서 sources/legal-dong-code.mjs(파서)가 아니라 여기 생성기에 둔다.
//     generate-seed-sql.mjs 의 LINES_SOURCE / STATIONS_SOURCE 와 같은 자리다.
// ========================================
const DISTRICT_SOURCE = '행정안전부 행정표준코드 법정동코드'

// ★ 이 값은 "다운로드 기준일"이 아니다.
//
//   정의: 이 snapshot 에서 현행 상태로 반영됨을 실데이터로 확인한
//         가장 최근 공식 법정동 변경 시행일.
//
//   근거 (2026-08-09 실데이터 확인):
//     - 전남광주통합특별시(12) 시군구 27개 전부 '존재' / 광주광역시(29)·전라남도(46)는
//       시도 레벨 행까지 전부 '폐지'(존재 0건)
//     - 인천 제물포(28125)·영종(28155)·서해(28275)·검단구(28290) '존재',
//       옛 중구(28110)·동구(28140)·서구(28260) '폐지'
//     - 화성시 일반구 4개(만세 41591 / 효행 41593 / 병점 41595 / 동탄 41597) '존재'
//     위 개편들의 공식 시행일이 2026-07-01 이다.
//
//   code.go.kr 다운로드 화면과 파일 내부 어디에도 기준일자 표기가 없어(컬럼 3개,
//   날짜 컬럼 0건) 공식 기준일을 확보할 수 없었다. 실행일·다운로드일은 쓰지 않는다 -
//   컬럼이 뜻하는 "외부 source 의 버전"과 의미가 달라진다.
//   재실행해도 같은 값이어야 하므로 자동 계산하지 않고 상수로 고정한다.
//
//   ※ 이 파일에는 시행 예정/현행을 구분할 근거가 없다(폐지여부 2종, 날짜 없음).
//     따라서 20260701 은 하한선이다. 상세: TODO_PHASE2.md 21번
//   ※ download date = 2026-08-09 (source_version 과 다른 값이다. 혼동하지 말 것)
const DISTRICT_SOURCE_VERSION = '20260701'

// station_districts 는 단일 외부 source 를 적재한 것이 아니라 결합된 derived relation 이다.
//   station 좌표       국가철도공단 표준데이터
//   좌표 -> district   Kakao coord2regioncode
//   physical station   seed-stations merge 결과
// source 는 "어디서 만들어진 관계인가"를 남길 수 있으므로 기록한다.
// ★ source_version 은 NULL 이다. merge_report md5/fingerprint 같은 값을 넣지 않는다 -
//   컬럼명이 암시하는 "외부 source 의 버전"과 의미가 달라진다. derived master 자체의
//   versioning 이 필요해지면 별도 정책으로 설계한다.
const RELATION_SOURCE = 'derived: Kakao coord2regioncode + seed-stations merge'

// ========================================
// contract - 맞추기 위한 분기를 넣지 않는다. 어긋나면 원인을 보고하고 중단한다.
// ========================================
const EXPECT = {
  candidates: 269,
  excludedParents: 13,
  districts: 256,
  stations: 308,
  relations: 318,
  singleDistrict: 298,
  multiDistrict: 10,
}

// ----------------------------------------
function sqlText(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function sqlNum(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'NULL'
  return String(v)
}

/** Kakao districtName 을 official name_ko 와 "비교하기 위해서만" 정규화한다. */
function kakaoNameForCompare(name) {
  // 일반구는 region_2depth_name 이 "성남시 분당구" 처럼 상위 시를 포함한다(실측 11건).
  // ★ 저장값을 Kakao 형식에 맞추지 않는다. official 이 source-of-truth 이고 Kakao 는 검증자다.
  //   이 함수의 반환값은 어떤 DB 컬럼에도 들어가지 않는다.
  return String(name ?? '').trim().split(/\s+/).at(-1)
}

// ----------------------------------------
async function main() {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch { /* 셸 환경변수만 쓰는 경우 */ }

  const errors = []

  // ========================================
  // 1. districts master
  // ========================================
  const ldcPath = await findSourceFile(sourceFiles.legalDongCode, '법정동코드 전체자료')
  const ldc = await loadLegalDongCode(ldcPath)

  const candidates = districtCandidates(ldc.rows)
  const { districts, excludedParents, issues } = resolveDistrictHierarchy(candidates)
  for (const i of issues) errors.push(`district 계층: ${i}`)

  if (candidates.length !== EXPECT.candidates) errors.push(`1단계 시군구 후보 = ${candidates.length} (기대 ${EXPECT.candidates})`)
  if (excludedParents.length !== EXPECT.excludedParents) errors.push(`상위 시 제외 = ${excludedParents.length} (기대 ${EXPECT.excludedParents})`)
  if (districts.length !== EXPECT.districts) errors.push(`최종 district = ${districts.length} (기대 ${EXPECT.districts})`)

  // 024 제약 재검증 - 1단계 필터가 구조적으로 보장하지만 한 곳만 믿지 않는다.
  for (const d of districts) {
    if (!/^[0-9]{5}$/.test(d.code5)) errors.push(`districts_code_format 위반: ${JSON.stringify(d.code5)}`)
    if (d.code5.slice(0, 2) !== d.sidoCode) errors.push(`districts_sido_prefix 위반: ${d.code5} / ${d.sidoCode}`)
    if (!d.nameKo) errors.push(`name_ko 가 비었다: ${d.code5} "${d.fullName}"`)
  }

  // ========================================
  // 2. station 재현 (generate-seed-sql.mjs 와 동일 경로 - 값을 다시 계산하지 않는다)
  // ========================================
  const railwayPath = await findSourceFile(sourceFiles.railwayStandard, '전국도시철도역사정보표준데이터')
  const railway = await loadRailwayStandard(railwayPath)

  const { minLat, maxLat, minLng, maxLng } = regionFilter.bbox
  const inBox = railway.units.filter((u) => u.lat >= minLat && u.lat <= maxLat && u.lng >= minLng && u.lng <= maxLng)

  const resolver = await createRegionResolver({ enabled: true })
  for (const u of inBox) u.district = await resolver.resolve(u.lat, u.lng)
  await resolver.persist()
  const kakaoStats = resolver.stats()
  if (kakaoStats.failureCount > 0) {
    errors.push(`Kakao 좌표 역변환 실패 ${kakaoStats.failureCount}건 - district 판정에 구멍이 있다`)
  }

  const units = inBox.filter((u) => u.district && regionFilter.sidoCodes.includes(u.district.districtCode.slice(0, 2)))
  if (units.length === 0) throw new Error('대상 지역에 남은 역이 없습니다.')

  annotateIdentities(units)
  const { stations, blockingIssues } = mergeStations(units, manualOverrides)
  if (blockingIssues.length > 0) {
    throw new Error(`manual override stale/unused ${blockingIssues.length}건 - SQL을 생성하지 않습니다.`)
  }
  if (stations.length !== EXPECT.stations) errors.push(`station = ${stations.length} (기대 ${EXPECT.stations})`)

  // ========================================
  // 3. [E] one-shot execution key
  //
  //    ★ station_code 단독 lookup 을 쓰지 않는다. migration_025:97 이 그 컬럼을
  //      "unique 가 아니다"라고 명시적으로 정의했다. 이번 308행에서 우연히 유일하더라도
  //      seed 연결의 사실상 natural key 로 쓰면 역이 추가되는 순간 깨진다.
  //
  //    ★ 이 4개 컬럼 tuple 은 영구 station natural key 가 아니다.
  //      이미 시드된 308 stations 와 현재 pipeline 결과를 이번 한 번 연결하기 위한
  //      execution key 다. 이 SQL 을 실행하고 나면 역할이 끝난다.
  //
  //    ★ 좌표는 seed_stations.sql 에 넣은 것과 정확히 같은 값·precision 을 쓴다.
  //      새 rounding rule 을 넣지 않는다 - 그 순간 join 이 0-match 가 된다.
  // ========================================
  const stationRows = stations.map((s) => ({
    stationCode: s.stationCode,
    nameKo: s.nameKo,
    lat: s.lat,
    lng: s.lng,
    districts: s.districts,
  }))

  const tupleKey = (r) => `${r.stationCode}|${r.nameKo}|${r.lat}|${r.lng}`
  const tupleSeen = new Map()
  for (const r of stationRows) {
    const k = tupleKey(r)
    if (tupleSeen.has(k)) {
      errors.push(`matching tuple 중복: (${r.stationCode}, ${r.nameKo}, ${r.lat}, ${r.lng})`)
    }
    tupleSeen.set(k, r)
    if (!r.stationCode) errors.push(`station_code 가 없다: ${r.nameKo}`)
    if (!r.nameKo) errors.push(`name_ko 가 없다: ${r.stationCode}`)
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) errors.push(`좌표가 없다: ${r.nameKo}`)
  }

  // ========================================
  // 4. station_districts 관계
  //    is_primary = districts[0]. merge.mjs 가 coordPriority 순으로 district 를 수집하므로
  //    대표 좌표를 제공한 unit 의 구가 첫 번째다(026 "역 대표 좌표가 속한 구").
  //    ★ 역명 기반 분기 없음. 특정 역 예외처리 없음.
  // ========================================
  const relations = []
  for (const [i, r] of stationRows.entries()) {
    for (const [j, d] of r.districts.entries()) {
      relations.push({ stationIndex: i, districtCode: d.districtCode, isPrimary: j === 0 })
    }
  }

  const singleCount = stationRows.filter((r) => r.districts.length === 1).length
  const multiCount = stationRows.filter((r) => r.districts.length > 1).length
  const noneCount = stationRows.filter((r) => r.districts.length === 0).length

  if (relations.length !== EXPECT.relations) errors.push(`station_districts = ${relations.length} (기대 ${EXPECT.relations})`)
  if (singleCount !== EXPECT.singleDistrict) errors.push(`single-district station = ${singleCount} (기대 ${EXPECT.singleDistrict})`)
  if (multiCount !== EXPECT.multiDistrict) errors.push(`multi-district station = ${multiCount} (기대 ${EXPECT.multiDistrict})`)
  if (noneCount !== 0) errors.push(`district 없는 station = ${noneCount} (기대 0)`)

  // ★ districts[0] 로직을 다시 신뢰하지 않고 생성된 관계 배열에서 직접 재집계한다.
  //   026 의 station_districts_one_primary unique index 를 SQL 실행 전에 잡기 위해서다.
  const primaryPerStation = new Map()
  const pairSeen = new Set()
  let duplicatePair = 0
  for (const rel of relations) {
    if (rel.isPrimary) primaryPerStation.set(rel.stationIndex, (primaryPerStation.get(rel.stationIndex) ?? 0) + 1)
    const pk = `${rel.stationIndex}|${rel.districtCode}`
    if (pairSeen.has(pk)) duplicatePair += 1
    pairSeen.add(pk)
  }
  const wrongPrimary = stationRows.filter((_, i) => (primaryPerStation.get(i) ?? 0) !== 1)
  if (wrongPrimary.length > 0) errors.push(`primary 가 정확히 1개가 아닌 station = ${wrongPrimary.length} (기대 0)`)
  if (duplicatePair !== 0) errors.push(`(station, district) 쌍 중복 = ${duplicatePair} (기대 0)`)

  // ========================================
  // 5. Kakao 교차검증 - official 이 source-of-truth, Kakao 는 검증자
  // ========================================
  const districtByCode = new Map(districts.map((d) => [d.code5, d]))
  const referenced = new Map()
  for (const r of stationRows) for (const d of r.districts) referenced.set(d.districtCode, d)

  let missingCode = 0
  let nameMismatch = 0
  for (const [code, kakao] of [...referenced.entries()].sort()) {
    const official = districtByCode.get(code)
    if (!official) {
      missingCode += 1
      errors.push(`Kakao 가 참조한 district ${code} ("${kakao.districtName}") 가 official master 에 없다`)
      continue
    }
    if (kakaoNameForCompare(kakao.districtName) !== official.nameKo) {
      nameMismatch += 1
      errors.push(`district ${code} 이름 불일치: kakao="${kakao.districtName}" official="${official.nameKo}"`)
    }
    if (!regionFilter.sidoCodes.includes(official.sidoCode)) {
      errors.push(`district ${code} 의 sido_code=${official.sidoCode} 가 대상 지역 밖이다`)
    }
  }

  // 관계 318건 전수의 FK 사전 검증(참조 코드 집합과 별개 지점에서 한 번 더 본다)
  let fkMissing = 0
  for (const rel of relations) {
    if (!districtByCode.has(rel.districtCode)) fkMissing += 1
  }
  if (fkMissing !== 0) errors.push(`station_districts FK 미충족 = ${fkMissing} (기대 0)`)

  // ========================================
  // 6. 게이트
  // ========================================
  if (errors.length > 0) {
    console.error('SQL 생성 전 validation 실패 - 파일을 생성하지 않습니다:')
    for (const e of errors) console.error(`  ✗ ${e}`)
    process.exitCode = 1
    return
  }

  const bySido = new Map()
  for (const d of districts) bySido.set(d.sidoCode, (bySido.get(d.sidoCode) ?? 0) + 1)
  const sidoSummary = [...bySido.entries()].sort().map(([k, v]) => `${k}=${v}`).join(' / ')

  console.log('SQL 생성 전 validation 전부 통과:')
  console.log(`  원본 ${ldc.rowCount}행 (현행 ${ldc.aliveCount} / 폐지 ${ldc.deadCount}) / trim 적용 ${ldc.trimmedCount}건`)
  console.log(`  1단계 시군구 후보 ${candidates.length} - 상위 시 ${excludedParents.length} = district ${districts.length}`)
  console.log(`  시도별: ${sidoSummary}`)
  console.log(`  station ${stationRows.length} / 관계 ${relations.length} (single ${singleCount} / multi ${multiCount})`)
  console.log(`  Kakao 교차검증: 참조 코드 ${referenced.size} / missing ${missingCode} / name mismatch ${nameMismatch}`)
  console.log(`  Kakao 캐시: apiCalls ${kakaoStats.apiCalls} / cacheHits ${kakaoStats.cacheHits} / failures ${kakaoStats.failureCount}`)
  console.log(`  제외된 상위 시: ${excludedParents.map((p) => `${p.code5} ${p.nameKo}`).join(' , ')}`)

  // ========================================
  // 7. SQL 생성
  // ========================================
  const L = []
  L.push('-- ============================================================')
  L.push('-- districts / station_districts seed (자동 생성 - 사람이 검토 후 실행)')
  L.push(`-- 생성 시각: ${new Date().toISOString()}`)
  L.push('-- 생성기: scripts/seed-stations/generate-districts-sql.mjs')
  L.push('-- ============================================================')
  L.push('--')
  L.push('-- ★ 전제: migration 024/025/026 적용 완료 + seed_stations.sql 실행 완료.')
  L.push('--   districts / station_districts 가 비어 있고 stations 가 정확히 308행이어야 한다.')
  L.push('--   아래 guard 3개가 이 전제를 직접 검사한다. DELETE/TRUNCATE 는 없다 -')
  L.push('--   재실행하면 실패하는 것이 의도된 동작이다.')
  L.push('--')
  L.push('-- ★ districts provenance')
  L.push(`--   source         = ${DISTRICT_SOURCE}`)
  L.push(`--   source_version = ${DISTRICT_SOURCE_VERSION}`)
  L.push('--   ※ source_version 은 다운로드 날짜가 아니다(다운로드 = 2026-08-09).')
  L.push('--     정의: 이 snapshot 에서 현행 상태로 반영됨을 실데이터로 확인한')
  L.push('--           가장 최근 공식 법정동 변경 시행일.')
  L.push('--     근거: 전남광주통합특별시(12) 통합 / 인천 제물포·영종·서해·검단구 신설 /')
  L.push('--           화성시 일반구 4개 신설이 전부 현행으로 반영돼 있고 시행일이 2026-07-01.')
  L.push('--     code.go.kr 에 기준일자 표기가 없어 공식 기준일을 확보할 수 없었다.')
  L.push('--     파일에 시행 예정/현행 구분 근거가 없어 이 값은 하한선이다(TODO_PHASE2 21번).')
  L.push('--   name_en/ja/zh = NULL (원본에 없다. 추측하지 않는다)')
  L.push('--   valid_from/valid_to = NULL (원본에 날짜 컬럼이 없다. 현행 행만 시드한다)')
  L.push('--')
  L.push('-- ★ district 집합 도출 [결정 1]')
  L.push(`--   1단계 시군구 레벨 후보 ${candidates.length} (현행 + 뒤5자리=00000 + 3~5자리≠000)`)
  L.push(`--   2단계 상위 시 ${excludedParents.length}개 제외 -> 최종 ${districts.length}`)
  L.push('--   일반구가 있는 시는 구만 남기고 상위 시 행을 뺀다(부동산 영업지역 단위가 구다).')
  L.push('--   ★ 법정동코드의 숫자 패턴으로 계층을 추론하지 않는다. token 계층으로 판정한다.')
  L.push('--     반례: 43740 영동군 / 43745 증평군 은 앞 4자리를 공유하지만 부모-자식이 아니다.')
  L.push('--     상세 근거와 폐기된 후보 B/C: scripts/seed-stations/lib/district-hierarchy.mjs')
  L.push(`--   제외된 상위 시: ${excludedParents.map((p) => `${p.code5} ${p.nameKo}`).join(' , ')}`)
  L.push('--')
  L.push('-- ★ station_districts')
  L.push(`--   ${EXPECT.relations}관계 = single ${singleCount} x1 + multi ${multiCount} x2. district 없는 station 0.`)
  L.push('--   is_primary = 역 대표 좌표가 속한 구(026 설계 의도). 역당 정확히 1개.')
  L.push('--   ★ 경계역 10개의 secondary district 는 현재 routing 에 쓰이지 않는다')
  L.push('--     (027:146 트리거가 is_primary 만 파생, 029:173/235 가 단일값 등호 비교).')
  L.push('--     026:8-9 가 상정한 그림대로 지금 넣어 둔다 - 나중에 029 술어만 넓히면')
  L.push('--     재시딩이 필요 없다. 상세: TODO_PHASE2.md 19번')
  L.push(`--   source = ${RELATION_SOURCE}`)
  L.push('--   source_version = NULL (결합 derived relation 이라 외부 source 버전이 없다)')
  L.push('--   routing_priority = 026 default(100) 그대로. MVP 미사용 컬럼에 값을 넣지 않는다.')
  L.push('--')
  L.push('-- ★ stations 연결 = one-shot execution key')
  L.push('--   (station_code, name_ko, latitude, longitude) 4개 컬럼 전부 등호 join 한다.')
  L.push('--   station_code 단독 lookup 을 쓰지 않는다 - 025:97 이 unique 가 아니라고 정의했다.')
  L.push('--   ★ 이 tuple 은 영구 natural key 가 아니다. 이미 시드된 308 stations 와')
  L.push('--     현재 pipeline 결과를 이번 한 번 연결하기 위한 값이다.')
  L.push('--   좌표는 seed_stations.sql 에 넣은 값과 동일하다(재반올림 없음).')
  L.push('-- ============================================================')
  L.push('')
  L.push('BEGIN;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push('-- guard 1/2: 대상 테이블이 비어 있는지. 3: stations 전제가 맞는지.')
  L.push('-- ------------------------------------------------------------')
  L.push('DO $guard$')
  L.push('DECLARE v_stations bigint;')
  L.push('BEGIN')
  L.push('  IF EXISTS (SELECT 1 FROM districts LIMIT 1) THEN')
  L.push("    RAISE EXCEPTION 'seed_districts.sql: districts 테이블이 비어 있지 않습니다. 이 SQL을 재실행하면 안 됩니다.';")
  L.push('  END IF;')
  L.push('  IF EXISTS (SELECT 1 FROM station_districts LIMIT 1) THEN')
  L.push("    RAISE EXCEPTION 'seed_districts.sql: station_districts 테이블이 비어 있지 않습니다. 이 SQL을 재실행하면 안 됩니다.';")
  L.push('  END IF;')
  L.push('  SELECT count(*) INTO v_stations FROM stations;')
  L.push(`  IF v_stations <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'seed_districts.sql: stations 가 % 행입니다. ${EXPECT.stations}행을 전제합니다 - seed_stations.sql 을 먼저 실행하십시오.', v_stations;`)
  L.push('  END IF;')
  L.push('END')
  L.push('$guard$;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push(`-- districts ${districts.length}행 (FK 방향: station_districts 보다 먼저)`)
  L.push('-- ------------------------------------------------------------')
  L.push('INSERT INTO districts (code, sido_code, name_ko, name_en, name_ja, name_zh, source, source_version, valid_from, valid_to) VALUES')
  L.push(
    districts
      .slice()
      .sort((a, b) => a.code5.localeCompare(b.code5))
      .map((d) => `  (${sqlText(d.code5)}, ${sqlText(d.sidoCode)}, ${sqlText(d.nameKo)}, NULL, NULL, NULL, ${sqlText(DISTRICT_SOURCE)}, ${sqlText(DISTRICT_SOURCE_VERSION)}, NULL, NULL)`)
      .join(',\n') + ';',
  )
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push(`-- station_districts ${relations.length}행`)
  L.push('--')
  L.push('-- seed 쪽 308개 station key 를 VALUES 로 만든 뒤 stations 와 4개 컬럼 등호 join 한다.')
  L.push('-- 개별 SELECT 를 반복하지 않는다 - 아래 DO 블록이 매칭 결과를 한 번에 검사한다.')
  L.push('-- ★ 역명이나 station_code 하나만으로 fallback lookup 하지 않는다.')
  L.push('--   어긋나면 사람이 원인을 확인해야 한다.')
  L.push('-- ------------------------------------------------------------')
  L.push('CREATE TEMP TABLE _seed_station_ref (')
  L.push('  seed_no      integer primary key,')
  L.push('  station_code text   not null,')
  L.push('  name_ko      text   not null,')
  L.push('  latitude     double precision not null,')
  L.push('  longitude    double precision not null')
  L.push(') ON COMMIT DROP;')
  L.push('')
  L.push('INSERT INTO _seed_station_ref (seed_no, station_code, name_ko, latitude, longitude) VALUES')
  L.push(
    stationRows
      .map((r, i) => `  (${i + 1}, ${sqlText(r.stationCode)}, ${sqlText(r.nameKo)}, ${sqlNum(r.lat)}, ${sqlNum(r.lng)})`)
      .join(',\n') + ';',
  )
  L.push('')
  L.push('CREATE TEMP TABLE _seed_station_match (')
  L.push('  seed_no    integer primary key,')
  L.push('  station_id uuid not null')
  L.push(') ON COMMIT DROP;')
  L.push('')
  L.push('INSERT INTO _seed_station_match (seed_no, station_id)')
  L.push('SELECT r.seed_no, s.id')
  L.push('  FROM _seed_station_ref r')
  L.push('  JOIN stations s')
  L.push('    ON s.station_code = r.station_code')
  L.push('   AND s.name_ko      = r.name_ko')
  L.push('   AND s.latitude     = r.latitude')
  L.push('   AND s.longitude    = r.longitude;')
  L.push('')
  L.push('DO $match$')
  L.push('DECLARE')
  L.push('  v_expected  bigint;')
  L.push('  v_matched   bigint;')
  L.push('  v_stations  bigint;')
  L.push('  v_zero      bigint;')
  L.push('BEGIN')
  L.push('  SELECT count(*) INTO v_expected FROM _seed_station_ref;')
  L.push('  SELECT count(DISTINCT seed_no) INTO v_matched FROM _seed_station_match;')
  L.push('  SELECT count(DISTINCT station_id) INTO v_stations FROM _seed_station_match;')
  L.push('  SELECT count(*) INTO v_zero FROM _seed_station_ref r')
  L.push('   WHERE NOT EXISTS (SELECT 1 FROM _seed_station_match m WHERE m.seed_no = r.seed_no);')
  L.push('')
  L.push(`  IF v_expected <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'seed reference 가 % 건입니다. ${EXPECT.stations} 건이어야 합니다.', v_expected;`)
  L.push('  END IF;')
  L.push('  IF v_zero > 0 THEN')
  L.push("    RAISE EXCEPTION '0-match seed station 이 % 건입니다. (station_code, name_ko, latitude, longitude) 4개 전부 일치하는 stations 행을 찾지 못했습니다.', v_zero;")
  L.push('  END IF;')
  L.push(`  IF v_matched <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'matched seed reference 가 % 건입니다. ${EXPECT.stations} 건이어야 합니다.', v_matched;`)
  L.push('  END IF;')
  L.push(`  IF v_stations <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'matched DB station 이 % 건입니다. ${EXPECT.stations} 건이어야 합니다(multi-match 의심).', v_stations;`)
  L.push('  END IF;')
  L.push('END')
  L.push('$match$;')
  L.push('')
  L.push('INSERT INTO station_districts (station_id, district_code, is_primary, source, source_version)')
  L.push('SELECT m.station_id, v.district_code, v.is_primary,')
  L.push(`       ${sqlText(RELATION_SOURCE)}, NULL`)
  L.push('  FROM (VALUES')
  L.push(
    relations
      .map((rel) => `    (${rel.stationIndex + 1}, ${sqlText(rel.districtCode)}, ${rel.isPrimary})`)
      .join(',\n'),
  )
  L.push('  ) AS v(seed_no, district_code, is_primary)')
  L.push('  JOIN _seed_station_match m ON m.seed_no = v.seed_no;')
  L.push('')
  L.push('COMMIT;')
  L.push('')
  L.push('-- ============================================================')
  L.push('-- verification query - read-only. COMMIT 이후 사람이 직접 실행한다.')
  L.push('-- ============================================================')
  L.push('')
  L.push('-- 기본 카디널리티')
  L.push("select 'districts' as t, count(*) as n from districts")
  L.push("union all select 'station_districts', count(*) from station_districts;")
  L.push(`-- 기대: districts=${districts.length} / station_districts=${relations.length}`)
  L.push('')
  L.push('-- 시도별 district 분포')
  L.push('select sido_code, count(*) from districts group by sido_code order by sido_code;')
  L.push(`-- 기대: ${sidoSummary}`)
  L.push('')
  L.push('-- 역당 district 수 분포')
  L.push('select district_count, count(*) as station_count from (')
  L.push('  select station_id, count(*) as district_count from station_districts group by station_id) x')
  L.push('group by district_count order by district_count;')
  L.push(`-- 기대: 1=${singleCount} / 2=${multiCount}`)
  L.push('')
  L.push('-- primary 가 정확히 1개가 아닌 station (기대: 0행)')
  L.push('select station_id, count(*) filter (where is_primary) as primary_count')
  L.push('  from station_districts group by station_id having count(*) filter (where is_primary) <> 1;')
  L.push('')
  L.push('-- districts 제약 위반 (기대: 각 0행)')
  L.push("select code from districts where code !~ '^[0-9]{5}$';")
  L.push('select code, sido_code from districts where left(code, 2) <> sido_code;')
  L.push('')
  L.push('-- FK 고아 (기대: 0행)')
  L.push('select sd.district_code from station_districts sd')
  L.push('  left join districts d on d.code = sd.district_code where d.code is null;')
  L.push('')
  L.push('-- 서울 25개 구 전수 (기대: 25행)')
  L.push("select code, name_ko from districts where sido_code = '11' order by code;")
  L.push('')
  L.push('-- 경계역 표본 - [결정 3] 결과 확인용. 고치기 위한 쿼리가 아니다.')
  L.push('select s.name_ko as station, d.name_ko as district, sd.is_primary')
  L.push('  from station_districts sd')
  L.push('  join stations s on s.id = sd.station_id')
  L.push('  join districts d on d.code = sd.district_code')
  L.push(" where s.name_ko in ('동작','총신대입구','신논현','신설동')")
  L.push(' order by s.name_ko, sd.is_primary desc;')
  L.push('-- 기대: 동작 서초구(t)/동작구(f) · 총신대입구 서초구(t)/동작구(f)')
  L.push('--       신논현 서초구(t)/강남구(f) · 신설동 동대문구(t)/종로구(f)')
  L.push('')

  await writeFile(outPath, L.join('\n') + '\n', 'utf-8')

  console.log(`\n작성됨: ${outPath}`)
  console.log(`  districts ${districts.length} / station reference ${stationRows.length} / station_districts ${relations.length}`)
  console.log('\n★ 이 스크립트는 SQL을 실행하지 않았습니다. 사람이 검토 후 Supabase SQL Editor에서 실행합니다.')
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}\n`)
  process.exitCode = 1
})
