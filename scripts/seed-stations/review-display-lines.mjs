// 표시 노선(display line) read-only 검증 - 308 station 전체 대상.
//
// 실행:  npm run seed:stations:display-review
//
// ★ 이 스크립트는 DB에 아무것도 쓰지 않는다. seed SQL 도 만들지 않는다.
//   merge_report.csv 를 다시 쓰지 않는다 (writeReport 를 호출하지 않는다).
//   merge.mjs/mergeStations() 의 산출물(station.lineIdentities/lineNames/units 등)을
//   읽기만 하고, 그 값을 이 스크립트가 바꾸는 일은 없다.
//
// 목적: lib/display-lines.mjs 의 24->18 매핑을 실제 306~308개 station 전체에
//   적용했을 때 dedupe/validation 이 기대대로 동작하는지 사람이 검수할 수 있는
//   리뷰 파일을 내놓는 것 하나다.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  regionFilter,
  repoRoot,
  reportPath,
  scriptDir,
  sourceFiles,
} from './config.mjs'
import {
  compareWithLegacyLineDisplayOrder,
  DISPLAY_LINE_METADATA,
  stationDisplayLines,
  validateDisplayLineMapping,
} from './lib/display-lines.mjs'
import { writeCsv } from './lib/csv.mjs'
import { findSourceFile } from './lib/files.mjs'
import { createRegionResolver } from './lib/kakao.mjs'
import { manualOverrides } from './manual-overrides.mjs'
import { annotateIdentities, mergeStations } from './merge.mjs'
import { loadRailwayStandard } from './sources/railway-standard.mjs'

const outputDir = path.join(scriptDir, 'output')

// [9] 사람이 개별 확인을 요청한 station. startsWith 매칭(부역명/괄호 표기 차이 대응).
const SPOT_CHECK_NAMES = [
  '왕십리', '창동', '도봉산', '온수', '김포공항', '서울역', '청량리', '회기', '광운대',
  '상봉', '이촌', '공덕', '홍대입구', '신촌', '신촌역', '신논현', '강남', '강남구청',
  '종로3가', '신설동', '중랑', '보라매',
]

function markdown({ stations, stats, spotChecks, legacyCompare, validation, i18nNullability, migrationCompat }) {
  const L = []
  L.push('# 표시 노선(display line) read-only 검증')
  L.push('')
  L.push('internal line identity 는 전혀 바뀌지 않았다. 이 리뷰는 `station.lineIdentities` 를')
  L.push('`identityToDisplayLineKey()` 로 변환 -> dedupe -> `displayOrder` 정렬한 **소비 결과**만 담는다.')
  L.push('merge_report.csv 는 이 스크립트가 다시 쓰지 않는다.')
  L.push('')
  L.push('## [10] 전체 통계')
  L.push('')
  L.push('| 지표 | 값 |')
  L.push('| --- | --- |')
  L.push(`| internal identity count | ${stats.identityCount} |`)
  L.push(`| display line count | ${stats.displayLineKeyCount} |`)
  L.push(`| unmapped identity count | ${stats.unmappedCount} |`)
  L.push(`| unused 서울 metadata count | ${stats.unusedMeta.length} (${stats.unusedMeta.join(', ') || '없음'}) |`)
  L.push(`| displayOrder collision count | ${stats.orderCollisionCount} |`)
  L.push(`| station 총 수 | ${stations.length} |`)
  L.push(`| dedupe 가 실제 발생한 station 수 | ${stats.dedupedStationCount} |`)
  L.push(`| dedupe 로 제거된 중복 총수 | ${stats.dedupRemovedTotal} |`)
  L.push('')
  L.push('### station 당 display line 개수 분포')
  L.push('')
  L.push('| 개수 | station 수 |')
  L.push('| --- | --- |')
  for (const k of ['1', '2', '3', '4', '5+']) L.push(`| ${k} | ${stats.countDist[k] ?? 0} |`)
  L.push('')
  L.push('### display line 별 station count')
  L.push('')
  L.push('| displayLineKey | nameKo | displayOrder | station count |')
  L.push('| --- | --- | --- | --- |')
  for (const row of stats.perLine) L.push(`| \`${row.key}\` | ${row.nameKo} | ${row.displayOrder} | ${row.stationCount} |`)
  L.push('')

  L.push('## [9] 개별 확인 station')
  L.push('')
  L.push('| station | internal identities | raw line names | display lines | dedupe 발생 |')
  L.push('| --- | --- | --- | --- | --- |')
  for (const s of spotChecks) {
    L.push(`| ${s.nameKo} | ${s.internalIdentities.join(', ')} | ${s.rawLineNames.join(', ')} | ${s.displayLineNamesKo.join(' / ')} | ${s.dedupRemovedCount > 0 ? `예(${s.dedupRemovedCount})` : '아니오'} |`)
  }
  L.push('')

  L.push('## [4] legacy config.mjs `lineDisplayOrder` 비교')
  L.push('')
  L.push(`- order 불일치: **${legacyCompare.mismatches.length}건** ${legacyCompare.mismatches.length > 0 ? JSON.stringify(legacyCompare.mismatches) : '(없음)'}`)
  L.push(`- legacy 에만 있는 항목(서울 MVP 범위 밖): ${legacyCompare.legacyOnly.map((x) => `${x.name}(${x.legacyOrder})`).join(', ')}`)
  L.push(`- "분당선"/"수인분당선" order 중복 등록(기존 상태): **${legacyCompare.bundangDuplicateInLegacy ? '예 — 둘 다 21' : '아니오'}**`)
  L.push('')

  L.push('## [6] validation 결과')
  L.push('')
  L.push(`- A/B/D/E: hard fail 없이 통과`)
  L.push(`- F: identity ${validation.identityCount}종 -> displayLineKey ${validation.displayLineKeyCount}종`)
  L.push(`- C(참고, hard fail 아님): 매핑에서 안 쓰이는 metadata 항목 = ${validation.unusedMeta.join(', ') || '없음'}`)
  L.push('')

  L.push('## [12] migration 025/029 compatibility dry analysis (SQL 생성 없음, 분석만)')
  L.push('')
  for (const line of migrationCompat) L.push(`- ${line}`)
  L.push('')

  L.push('## [13] 다국어 조사 (임의 번역 작성 없음)')
  L.push('')
  for (const line of i18nNullability) L.push(`- ${line}`)
  L.push('')

  return L.join('\n')
}

async function main() {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch { /* 셸 환경변수만 쓰는 경우 */ }

  // ----------------------------------------
  // 1. run.mjs 와 동일한 방식으로 실데이터 로드 (merge_report.csv 와 같은 308 station 을 재현한다)
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

  // ----------------------------------------
  // 2. merge (manual override 23건 포함 - merge_report.csv 를 만드는 run.mjs 와 동일한 입력)
  const { stations, overrideAudit, blockingIssues } = mergeStations(units, manualOverrides)

  if (blockingIssues.length > 0) {
    throw new Error(
      `manual override stale/unused ${blockingIssues.length}건 - display line 검증을 진행하지 않습니다. ` +
      `(이 스크립트는 merge 판정을 바꾸지 않으므로, 이 에러는 이 작업과 무관한 override 상태 변화를 뜻한다)`,
    )
  }
  const applied = overrideAudit.filter((a) => a.status === 'applied')
  const stale = overrideAudit.filter((a) => a.status === 'stale')
  const unused = overrideAudit.filter((a) => a.status === 'unused')

  // ----------------------------------------
  // 3. [6] validation - 실제로 관측된 identity 전수로 A 를 검증한다 (hard fail)
  const seenIdentities = new Set(stations.flatMap((s) => s.lineIdentities))
  const validation = validateDisplayLineMapping(seenIdentities)

  // ----------------------------------------
  // 4. station 별 display line 계산 (station 원본 필드는 건드리지 않는다)
  const rows = stations.map((s) => {
    const { lines, dedupRemovedCount } = stationDisplayLines(s.lineIdentities)
    return {
      station: s,
      internalIdentities: s.lineIdentities,
      rawLineNames: s.lineNames,
      displayLines: lines,
      dedupRemovedCount,
    }
  })

  // ----------------------------------------
  // 5. [10] 통계
  const countDist = {}
  for (const r of rows) {
    const n = r.displayLines.length
    const k = n >= 5 ? '5+' : String(n)
    countDist[k] = (countDist[k] ?? 0) + 1
  }
  const perLineCount = new Map(Object.keys(DISPLAY_LINE_METADATA).map((k) => [k, 0]))
  for (const r of rows) for (const l of r.displayLines) perLineCount.set(l.key, (perLineCount.get(l.key) ?? 0) + 1)
  const perLine = Object.values(DISPLAY_LINE_METADATA)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((m) => ({ ...m, stationCount: perLineCount.get(m.key) ?? 0 }))

  const orderValues = Object.values(DISPLAY_LINE_METADATA).map((m) => m.displayOrder)
  const orderCollisionCount = orderValues.length - new Set(orderValues).size

  const stats = {
    identityCount: validation.identityCount,
    displayLineKeyCount: validation.displayLineKeyCount,
    unmappedCount: 0, // validateDisplayLineMapping 이 hard fail 하지 않았으므로 0
    unusedMeta: validation.unusedMeta,
    orderCollisionCount,
    dedupedStationCount: rows.filter((r) => r.dedupRemovedCount > 0).length,
    dedupRemovedTotal: rows.reduce((a, r) => a + r.dedupRemovedCount, 0),
    countDist,
    perLine,
  }

  // ----------------------------------------
  // 6. [9] 개별 확인 station
  const spotChecks = SPOT_CHECK_NAMES.map((name) => {
    const r = rows.find((x) => x.station.nameKo === name || x.station.nameKo.startsWith(name))
    if (!r) return { nameKo: `${name} ★ 누락`, internalIdentities: [], rawLineNames: [], displayLineNamesKo: [], dedupRemovedCount: 0 }
    return {
      nameKo: r.station.nameKo,
      internalIdentities: r.internalIdentities,
      rawLineNames: r.rawLineNames,
      displayLineNamesKo: r.displayLines.map((l) => l.nameKo),
      dedupRemovedCount: r.dedupRemovedCount,
    }
  })

  // ----------------------------------------
  // 7. [4] legacy 비교
  const legacyCompare = compareWithLegacyLineDisplayOrder()

  // ----------------------------------------
  // 8. [12] migration 025/029 compatibility dry analysis (텍스트 보고만, SQL 없음)
  const migrationCompat = [
    'lines = 18 logical row 가정과 일치: DISPLAY_LINE_METADATA 가 정확히 18개 key 를 갖는다(F 검증 통과).',
    'station_lines PK(station_id, line_id) 는 dedupe 의 "최종 방어선"으로만 필요하다 - ' +
      'stationDisplayLines() 가 이미 JS 레벨에서 unique 목록을 만들어 넘기므로 seed SQL 이 duplicate row 를 전달할 필요가 없다.',
    `029 array_agg(l.name_ko order by l.display_order) 재현: 이 스크립트가 계산한 station 당 displayLines 도 동일하게 ` +
      `displayOrder 오름차순이다 (X4 selftest 로 고정). 실행 결과 예시 - 청량리: ${JSON.stringify(rows.find((r) => r.station.nameKo.startsWith('청량리'))?.displayLines.map((l) => l.nameKo) ?? [])}.`,
    'lines.id(uuid) 는 시드 실행마다 새로 생성되는 값이라 displayLineKey 에 하드코딩할 수 없다 - ' +
      '향후 seed SQL 단계에서는 "INSERT ... ON CONFLICT(line_code) DO UPDATE ... RETURNING id" 류로 ' +
      'displayLineKey(코드) -> 방금 만들어진/기존 lines.id 를 실행 시점에 조회해 station_lines 에 연결하는 형태가 필요해 보인다 ' +
      '(이번 단계에서 SQL 은 작성하지 않았다 - 분석만).',
  ]

  // ----------------------------------------
  // 9. [13] 다국어 조사 - migration_025 컬럼 정의를 그대로 인용 (임의 번역 없음)
  const i18nNullability = [
    'lines.name_ko: `text not null` (025:77) — 필수.',
    'lines.name_en / name_ja / name_zh: `text` (025:78-80), NOT NULL 제약 없음, DEFAULT 없음(=미지정 시 NULL). nullable.',
    '제안 A(DB lines.name_*): 025가 이미 이 컬럼들을 갖추고 있고, station_lines 조인 하나로 언어별 값을 낼 수 있다. ' +
      '다만 name_en/ja/zh 는 현재 전부 비어 있으며 이번 조사에서 채우지 않았다.',
    '제안 B(frontend shared translations): src/shared/routes/ProfileMissingError.translations.js 가 ' +
      '"여러 영역이 공유하는 텍스트"의 기존 선례다. 노선명도 customer/realtor 양쪽이 쓰므로 이 패턴과 위치 규칙이 맞다.',
    '제안 C(둘 다 필요) 가능성: DB 값(lines.name_*)을 소스로 하되, ko/en/ja/zh 4개 언어 중 DB에 없는 언어(en/ja/zh) 는 ' +
      '결손 시 프론트 폴백이 필요할 수 있다 — 이는 A/B 중 하나를 정하는 문제라기보다 "DB가 비어 있을 때 무엇을 보여줄지"의 ' +
      '별도 정책 결정이 필요하다는 뜻이다. 이번 단계에서는 판단하지 않는다(사람 결정 필요, 번역문 미작성).',
  ]

  // ----------------------------------------
  await mkdir(outputDir, { recursive: true })

  await writeCsv(
    path.join(outputDir, 'display_line_review.csv'),
    [
      'station_name', 'decision', 'internal_identities', 'raw_line_names',
      'display_line_keys', 'display_line_names_ko', 'display_line_count', 'dedup_removed_count',
    ],
    rows.map((r) => ({
      station_name: r.station.nameKo,
      decision: r.station.decision,
      internal_identities: r.internalIdentities.join(' '),
      raw_line_names: r.rawLineNames.join(' | '),
      display_line_keys: r.displayLines.map((l) => l.key).join(' '),
      display_line_names_ko: r.displayLines.map((l) => l.nameKo).join(' · '),
      display_line_count: r.displayLines.length,
      dedup_removed_count: r.dedupRemovedCount,
    })),
  )

  await writeFile(
    path.join(outputDir, 'display_line_review.md'),
    markdown({ stations, stats, spotChecks, legacyCompare, validation, i18nNullability, migrationCompat }),
    'utf-8',
  )

  // ----------------------------------------
  console.log(`[11] regression 참고값 - source rows ${units.length} / stations ${stations.length}`)
  console.log(`     manual override applied ${applied.length} / stale ${stale.length} / unused ${unused.length}`)
  console.log(`[6]  validation 통과 - identity ${validation.identityCount} -> displayLineKey ${validation.displayLineKeyCount}`)
  console.log(`     unused metadata: ${validation.unusedMeta.join(', ') || '없음'}`)
  console.log(`[10] dedupe 발생 station ${stats.dedupedStationCount} / 제거된 중복 ${stats.dedupRemovedTotal}`)
  console.log(`     개수 분포: ${JSON.stringify(stats.countDist)}`)
  console.log(`\n출력: ${outputDir}`)
  console.log('  display_line_review.csv / display_line_review.md')
  console.log(`\n★ merge_report.csv(${reportPath}) 는 이 스크립트가 건드리지 않는다.`)
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}\n`)
  process.exitCode = 1
})
