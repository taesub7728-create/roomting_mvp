// 역 시드 준비 - 소스 파싱 -> line identity -> 병합 -> merge_report.csv
//
// 실행:  npm run seed:stations
//        npm run seed:stations -- --no-kakao     (Kakao 호출 없이 파싱/병합만 확인)
//
// ★ 이 스크립트는 DB에 아무것도 쓰지 않는다. 시드 SQL 도 만들지 않는다.
//   목적은 "병합 결과를 사람이 검수할 수 있는 형태로 내놓는 것" 하나다.

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  dryRunReportPath,
  regionFilter,
  repoRoot,
  reportPath,
  scriptDir,
  sourceFiles,
} from './config.mjs'
import { writeCsv } from './lib/csv.mjs'
import { findSourceFile } from './lib/files.mjs'
import { createRegionResolver } from './lib/kakao.mjs'
import { assertNormalizerMatchesSql } from './lib/normalize.mjs'
import { overridesForRun } from './lib/override-scope.mjs'
import { validateManualOverrides } from './lib/override-schema.mjs'
import {
  coordinatePriority,
  nameSplits,
  segmentSplits,
  transferCodeAdapter,
} from './line-identity.mjs'
import { manualOverrides } from './manual-overrides.mjs'
import { annotateIdentities, attachI18n, mergeStations } from './merge.mjs'
import { writeReport } from './report.mjs'
import { loadRailwayStandard } from './sources/railway-standard.mjs'
import { loadSeoulMetroI18n } from './sources/seoul-metro-i18n.mjs'

const outputDir = path.join(scriptDir, 'output')
const overrideAuditPath = path.join(outputDir, 'override_audit.csv')

const OVERRIDE_AUDIT_COLUMNS = [
  'review_id', 'candidate_name', 'verdict', 'status',
  'stored_fingerprint', 'current_fingerprint',
  'automatic_cluster_count', 'final_cluster_count', 'partition_summary', 'note',
]

const useKakao = !process.argv.includes('--no-kakao')

function loadDotEnv() {
  const fromShell = process.env.KAKAO_REST_API_KEY
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    return false
  }
  if (fromShell) process.env.KAKAO_REST_API_KEY = fromShell
  return true
}

const log = (msg) => console.log(msg)
const step = (n, msg) => console.log(`\n[${n}] ${msg}`)

function inBbox(u) {
  const { minLat, maxLat, minLng, maxLng } = regionFilter.bbox
  return u.lat >= minLat && u.lat <= maxLat && u.lng >= minLng && u.lng <= maxLng
}

async function main() {
  const warnings = []

  log(loadDotEnv() ? '.env 로드됨 (값은 출력하지 않는다)' : '.env 없음 - 셸 환경변수만 사용한다')

  if (!useKakao) {
    log(['', '='.repeat(72),
      '  --no-kakao: 좌표->시군구 역변환을 건너뜁니다.',
      '  district 미해결 상태의 결과는 merge_report.dryrun.csv 로 나가며 검수용이 아닙니다.',
      '='.repeat(72)].join('\n'))
  }

  // ----------------------------------------
  step(1, '정규화 함수 대조 (migration_026 확인 벡터)')
  log(`  통과 ${assertNormalizerMatchesSql()}건`)

  // ----------------------------------------
  step(2, '수동 override 구조 검증 (manual-overrides.mjs)')
  validateManualOverrides(manualOverrides)
  log(`  항목 ${manualOverrides.length}건 형식 통과`)
  log(`  verdict 분포: ${JSON.stringify(
    manualOverrides.reduce((a, o) => { a[o.verdict] = (a[o.verdict] ?? 0) + 1; return a }, {}),
  )}`)

  // ----------------------------------------
  step(3, '원본 데이터 파싱')
  const railwayPath = await findSourceFile(sourceFiles.railwayStandard, '전국도시철도역사정보표준데이터')
  const railway = await loadRailwayStandard(railwayPath)
  log(`  ${railwayPath}`)
  log(`  인코딩 ${railway.encoding} / 전체 ${railway.rowCount}행 -> 유효 ${railway.units.length}행`)
  if (railway.skipped.length > 0) {
    const reasons = railway.skipped.reduce((a, s) => { a[s.reason] = (a[s.reason] ?? 0) + 1; return a }, {})
    warnings.push(`표준데이터 ${railway.skipped.length}행 제외: ${JSON.stringify(reasons)}`)
  }
  if (railway.missingOptional.length > 0) {
    warnings.push(`표준데이터에서 못 찾은 선택 컬럼: ${railway.missingOptional.join(', ')}`)
  }
  {
    const withSub = railway.units.filter((u) => u.subName)
    log(`  주역명/부역명 분해: 부역명 있는 행 ${withSub.length} (고유 역명 ${new Set(withSub.map((u) => u.rawName)).size})`)
  }

  // ----------------------------------------
  step(4, '대상 지역 사전 필터 (bbox)')
  const inRegionBox = railway.units.filter(inBbox)
  log(`  ${railway.units.length} -> ${inRegionBox.length}행`)

  // ----------------------------------------
  step(5, useKakao ? '좌표 -> 시군구 코드 역변환 (Kakao coord2regioncode)' : '역변환 건너뜀')
  const resolver = await createRegionResolver({ enabled: useKakao })
  let resolved = 0
  for (const unit of inRegionBox) {
    unit.district = await resolver.resolve(unit.lat, unit.lng)
    if (unit.district) resolved += 1
  }
  await resolver.persist()

  const stats = resolver.stats()
  const regionFailures = resolver.failures()
  if (useKakao) {
    log(`  해결 ${resolved}/${inRegionBox.length}`)
    log(`  API 호출(miss) ${stats.apiCalls} · 캐시 적중(hit) ${stats.cacheHits} · 캐시 파일 ${stats.cacheLoaded ? '있음' : '없음(첫 실행)'}`)
    log(`  좌표 단위 실패 ${regionFailures.length}건`)
    for (const f of regionFailures) {
      const owners = inRegionBox.filter((u) => u.lat === f.lat && u.lng === f.lng).map((u) => `${u.rawName}(${u.lineName})`)
      log(`  FAIL lat=${f.lat} lng=${f.lng} status=${f.status ?? '-'}`)
      log(`       ${f.reason}`)
      log(`       해당 역: ${owners.join(', ') || '(매칭 없음)'}`)
    }
    if (regionFailures.length > 0) warnings.push(`좌표 ${regionFailures.length}건 역변환 실패 - 대상에서 빠집니다.`)
  }

  // ----------------------------------------
  step(6, '시도 코드로 최종 필터')
  // [C] district 는 여기서 "대상 범위 판정"에만 쓴다. 그룹핑 키에는 쓰지 않는다.
  const units = useKakao
    ? inRegionBox.filter((u) => u.district && regionFilter.sidoCodes.includes(u.district.districtCode.slice(0, 2)))
    : inRegionBox
  log(`  ${inRegionBox.length} -> ${units.length}행 (sido ${regionFilter.sidoCodes.join(', ')})`)
  if (units.length === 0) throw new Error('대상 지역에 남은 역이 없습니다. config.mjs 의 regionFilter 를 확인하십시오.')

  // ----------------------------------------
  step(7, 'line identity 해석')
  const { unresolvedCodes, missingPriority } = annotateIdentities(units)

  const identityCount = new Map()
  for (const u of units) identityCount.set(u.lineIdentity, (identityCount.get(u.lineIdentity) ?? 0) + 1)
  log(`  identity ${identityCount.size}종 / source 노선번호 ${new Set(units.map((u) => u.lineCode)).size}종`)

  for (const s of segmentSplits) {
    const below = units.filter((u) => u.lineIdentity === s.below.identity).length
    const above = units.filter((u) => u.lineIdentity === s.atOrAbove.identity).length
    if (below + above === 0) continue
    log(`  segment split ${s.sourceLineCode}(${s.sourceLineName}) @${s.criterion} < ${s.boundary}`)
    log(`     ${s.below.identity} ${below}행 — ${s.below.meaning}`)
    log(`     ${s.atOrAbove.identity} ${above}행 — ${s.atOrAbove.meaning}`)
  }
  for (const n of nameSplits) {
    const parts = Object.entries(n.byNormalizedLineName)
      .map(([nm, v]) => `${v.identity} ${units.filter((u) => u.lineIdentity === v.identity).length}행 (${nm})`)
    if (units.some((u) => u.lineCode === n.sourceLineCode)) {
      log(`  name split ${n.sourceLineCode}: ${parts.join(' / ')}`)
      const unmapped = units.filter((u) => u.lineCode === n.sourceLineCode && u.lineIdentity === n.sourceLineCode)
      if (unmapped.length > 0) {
        warnings.push(`${n.sourceLineCode} 에 등록되지 않은 raw 노선명 ${unmapped.length}행: ${[...new Set(unmapped.map((u) => u.lineName))].join(', ')}`)
      }
    }
  }

  const usedAdapter = Object.keys(transferCodeAdapter).filter((c) => units.some((u) => u.transferLineCodes.includes(c)))
  log(`  transfer-code adapter 적용 ${usedAdapter.length}/${Object.keys(transferCodeAdapter).length}종: ${usedAdapter.join(', ')}`)

  if (unresolvedCodes.size > 0) {
    // ★ 자동 추측하지 않는다. 해당 관계는 merge 시키지 않고 hold 로 보낸다.
    warnings.push(
      `해석되지 않은 환승노선번호 ${unresolvedCodes.size}종: ${[...unresolvedCodes].map(([c, n]) => `${c}×${n}`).join(', ')}\n` +
      '     line-identity.mjs 의 transferCodeAdapter 에 근거와 함께 등록하기 전에는 merge 되지 않습니다.',
    )
  } else {
    log('  해석되지 않은 환승노선번호: 없음')
  }

  if (missingPriority.size > 0) {
    warnings.push(
      `coordinatePriority 미등록 identity ${missingPriority.size}종: ${[...missingPriority].map(([i, n]) => `${i}×${n}`).join(', ')}\n` +
      '     대표 좌표 선택에서 맨 뒤로 밀립니다. line-identity.mjs 에 등록하십시오.',
    )
  } else {
    log('  coordinatePriority 미등록 identity: 없음')
  }

  // ----------------------------------------
  step(8, '병합 (candidate group = normalize(main_name))')
  const { stations, groups, pairStats, overrideAudit, blockingIssues } =
    mergeStations(units, overridesForRun(useKakao, manualOverrides))
  const splitGroups = groups.filter((g) => g.clusterCount > 1)
  log(`  역-노선 ${units.length}건 -> candidate group ${groups.length}개 -> station ${stations.length}행`)
  log(`  그룹 내 전체 쌍 ${pairStats.total} / 규칙(5) 판정 필요 쌍 ${pairStats.need5} / 그중 PASS ${pairStats.pass} / 미해결 ${pairStats.need5 - pairStats.pass}`)
  log(`  쌍 판정 실패 사유별: ${[...pairStats.failBy].map(([k, v]) => `${k} ${v}`).join(' / ') || '없음'}`)
  log(`  같은 이름인데 갈라진 그룹: ${splitGroups.length}개`)

  // ----------------------------------------
  step(9, 'manual override 적용 결과')
  if (!useKakao) {
    log('  --no-kakao: district 미해결이라 override 를 적용하지 않았습니다 (검수용 실행에서만 적용됩니다).')
  }
  await mkdir(outputDir, { recursive: true })
  await writeCsv(overrideAuditPath, OVERRIDE_AUDIT_COLUMNS, overrideAudit)
  log(`  ${overrideAuditPath}`)

  const applied = overrideAudit.filter((a) => a.status === 'applied')
  const stale = overrideAudit.filter((a) => a.status === 'stale')
  const unused = overrideAudit.filter((a) => a.status === 'unused')
  log(`  적용 ${applied.length} / stale ${stale.length} / unused ${unused.length} (전체 override ${useKakao ? manualOverrides.length : 0}건)`)

  if (blockingIssues.length > 0) {
    log('')
    log('!'.repeat(72))
    log(`  override stale/unused ${blockingIssues.length}건 - 이번 실행은 검수 완료로 취급하지 않습니다.`)
    log('!'.repeat(72))
    for (const issue of stale) {
      log(`  STALE   ${issue.review_id}  ${issue.candidate_name}`)
      log(`          저장된 fingerprint  ${issue.stored_fingerprint}`)
      log(`          현재   fingerprint  ${issue.current_fingerprint}`)
    }
    for (const issue of unused) {
      log(`  UNUSED  ${issue.review_id}  ${issue.candidate_name}`)
      log('          이번 실행의 어떤 candidate group 도 이 reviewId 를 내지 않았습니다.')
    }
    log('')
    log('  재판정 경로 (README.md 「override 가 stale/unused 로 걸렸을 때」):')
    log('    1) npm run seed:stations:inventory 로 inventory 를 다시 만든다')
    log('    2) 위 review_id 들의 새 fingerprint 를 manual_review_inventory.csv/md 에서 확인한다')
    log('    3) 그룹 구성이 실제로 왜 바뀌었는지 사람이 재검토한다 (자동으로 승인하지 않는다)')
    log('    4) manual-overrides.mjs 의 fingerprint(그리고 필요하면 reviewId/판정)를 갱신한다')
    log('')
    log(`  ${useKakao ? reportPath : dryRunReportPath} 는 이전 실행 결과 그대로 두고 갱신하지 않습니다.`)
    throw new Error(
      `manual override stale/unused ${blockingIssues.length}건. 정상 검수 리포트를 생성하지 않고 중단합니다 - 위 로그와 ${overrideAuditPath} 를 확인하십시오.`,
    )
  }
  log('  stale/unused 없음 - 계속 진행합니다.')

  // ----------------------------------------
  step(10, '다국어 표기(ja/zh) 결합')
  const i18nPath = await findSourceFile(sourceFiles.seoulMetroI18n, '서울교통공사 역명다국어표기')
  const i18n = await loadSeoulMetroI18n(i18nPath)
  log(`  ${i18nPath}`)
  log(`  인코딩 ${i18n.encoding} / ${i18n.rowCount}행 -> 고유 역명 ${i18n.byName.size}개`)
  const attach = attachI18n(stations, i18n.byName)
  log(`  결합 ${attach.matched}/${stations.length}역`)
  if (i18n.conflicts.length > 0) warnings.push(`다국어 파일 값 충돌 ${i18n.conflicts.length}건(먼저 읽은 값 유지).`)

  // ----------------------------------------
  step(11, '검수 리포트 생성')
  const outPath = useKakao ? reportPath : dryRunReportPath
  const summary = await writeReport(outPath, stations)
  log(`  ${outPath}`)
  log(`  총 ${summary.total}행 · ${JSON.stringify(summary.byDecision)}`)
  log(`  복수 district station: ${summary.multiDistrict}건`)
  log(`  ja 결손 ${summary.jaMissing} · zh 결손 ${summary.zhMissing}`)

  // ----------------------------------------
  log('\n' + '='.repeat(72))
  if (warnings.length > 0) {
    log('경고')
    for (const w of warnings) log(`  ! ${w}`)
    log('')
  }
  log(`검수 대상 (needs_review=true): ${summary.needsReview}건`)
  log('')
  log('다음 순서:')
  log(`  1) ${outPath} 의 needs_review=true 행을 coord_spread_m 내림차순으로 확인한다`)
  log('  2) 규칙이 틀렸으면 line-identity.mjs 의 reference 또는 config.mjs 의 임계값을 고친다')
  log('     - 역명을 코드에 하드코딩해 예외 처리하지 않는다')
  log('  3) 검수를 마친 뒤에 시드 SQL 생성 단계로 넘어간다 (아직 구현되지 않음)')
  log('='.repeat(72))

  // 보고용 상세는 별도 인자 없이 항상 남긴다(양이 적다)
  if (Object.keys(coordinatePriority).length === 0) throw new Error('coordinatePriority 가 비어 있습니다.')
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}\n`)
  process.exitCode = 1
})
