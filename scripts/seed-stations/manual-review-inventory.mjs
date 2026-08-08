// hold / needs_review 전수를 사람이 검수할 수 있는 형태로 정리한다.
//
// 실행:  npm run seed:stations:inventory
//
// ★ 이 스크립트는 판정하지 않는다.
//   자동 병합 로직은 동결됐고 여기서 규칙을 바꾸거나 hold 를 줄이지 않는다.
//   현재 계산 결과를 검수표로 옮겨 적을 뿐이며, CONFIRMED_MERGE / CONFIRMED_SPLIT /
//   MIXED 는 전부 빈 칸으로 둔다. manual override 구조도 아직 만들지 않는다.
//
// ★ 검수 단위는 pair 나 cluster 가 아니라 candidate group 이다.
//   (normalize(main_name) 하나. 그 안에 여러 source row / cluster / pair 가 들어간다)
//
// 출력은 scripts/seed-stations/output/ 이며 .gitignore 대상이다.
// DB 입력도 seed SQL 도 아니고 매 실행마다 재생성된다.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { COORD_MERGE_MAX_M, dataDir, regionFilter, repoRoot, scriptDir, sourceFiles } from './config.mjs'
import { writeCsv } from './lib/csv.mjs'
import { findSourceFile } from './lib/files.mjs'
import { haversineMeters } from './lib/geo.mjs'
import { createRegionResolver } from './lib/kakao.mjs'
import { annotateIdentities, mergeStations } from './merge.mjs'
import { loadRailwayStandard } from './sources/railway-standard.mjs'

// ★ fingerprint 는 여기서 다시 계산하지 않는다. mergeStations() 가 override 적용 로직과
//   똑같은 lib/fingerprint.mjs 로 계산한 값을 groups(리포트)에 실어 돌려준다 - 그 값을 그대로 쓴다.
//   두 곳에서 각자 계산하면 "같은 함수를 쓴다"는 보장이 실제로는 "같은 로직을 두 번 베꼈다"가 된다.

const outputDir = path.join(scriptDir, 'output')

// ========================================
// 검수표 라벨 전용 표
//
// ★ 병합 판정에 일절 관여하지 않는다. line-identity.mjs 의 service family 가 아니다.
//   "승객 관점으로는 같은 노선인데 이번 시드에서 의도적으로 묶지 않은 identity" 를
//   검수자가 알아볼 수 있게 사유 코드를 붙이기 위한 것이다.
//   여기 등록해도 merge 결과는 전혀 바뀌지 않는다.
// ========================================
const POLICY_SEPARATED_IDENTITY_GROUPS = [
  {
    label: '1호선 계열',
    identities: ['I4101', 'I1101', 'I4102@N'],
    note: '경부선/경인선/경원선 북부. 승객에게는 모두 1호선이지만 서울 시드에서 service family 를 추가하지 않기로 했다. 확장 시 재검토 가능한 정책적 hold.',
  },
]

const CAUSE = {
  MISSING_TRANSFER_CODE: 'missing_transfer_code',
  MISSING_COUNTERPART: 'missing_counterpart',
  SOURCE_VALUE_CONFLICT: 'source_value_conflict',
  NON_TRANSFER_FLAG: 'non_transfer_flag',
  INTENTIONAL_IDENTITY_SEPARATION: 'intentional_identity_separation',
  DISTANCE_OVER_THRESHOLD: 'distance_over_threshold',
  OTHER: 'other',
}

function policyGroupOf(identityA, identityB) {
  return POLICY_SEPARATED_IDENTITY_GROUPS.find(
    (g) => g.identities.includes(identityA) && g.identities.includes(identityB) && identityA !== identityB,
  )
}

/**
 * 한 pair 가 왜 안 붙었는지 사유 코드를 매긴다. 복수 가능.
 * 이름으로 원천 결손을 보정하지 않는다 - source_value_conflict 는
 * "코드와 이름이 서로 다른 노선을 가리킨다"는 사실을 기록만 한다.
 */
function classifyPair(a, b) {
  const causes = new Set()
  const distanceM = haversineMeters(a, b)

  if (distanceM > COORD_MERGE_MAX_M) causes.add(CAUSE.DISTANCE_OVER_THRESHOLD)
  if (!a.isTransfer || !b.isTransfer) causes.add(CAUSE.NON_TRANSFER_FLAG)

  const aHasB = a.transferIdentities.has(b.lineIdentity)
  const bHasA = b.transferIdentities.has(a.lineIdentity)

  for (const [self, other, has] of [[a, b, aHasB], [b, a, bHasA]]) {
    if (has) continue
    if (self.transferLineCodes.length === 0) {
      causes.add(CAUSE.MISSING_TRANSFER_CODE)
      continue
    }
    if (policyGroupOf(self.lineIdentity, other.lineIdentity) ||
        [...self.transferIdentities].some((id) => policyGroupOf(id, other.lineIdentity))) {
      causes.add(CAUSE.INTENTIONAL_IDENTITY_SEPARATION)
      continue
    }
    // 이름으로는 상대를 적어 놓고 코드가 다른 노선을 가리키는 경우
    const raw = (self.transferLineNamesRaw ?? '').replace(/\s+/g, '')
    const otherName = (other.lineName ?? '').replace(/\s+/g, '')
    if (otherName && raw.includes(otherName)) causes.add(CAUSE.SOURCE_VALUE_CONFLICT)
    else causes.add(CAUSE.MISSING_COUNTERPART)
  }

  if (causes.size === 0) causes.add(CAUSE.OTHER)
  return { causes: [...causes], distanceM, aHasB, bHasA }
}

function buildGroups(units, stations, mergeGroupReports) {
  const fingerprintByKey = new Map(mergeGroupReports.map((g) => [g.key, g]))
  const byKey = new Map()
  for (const u of units) {
    if (!byKey.has(u.mainNameNormalized)) byKey.set(u.mainNameNormalized, { rows: [], clusters: [] })
    byKey.get(u.mainNameNormalized).rows.push(u)
  }
  for (const s of stations) {
    const g = byKey.get(s.candidateKey)
    if (g) g.clusters.push(s)
  }

  const groups = []
  for (const [key, g] of byKey) {
    // 검수 대상은 hold 가 하나라도 있거나 needs_review 인 group
    if (!g.clusters.some((c) => c.decision === 'hold' || c.needsReview)) continue

    const pairs = []
    for (let i = 0; i < g.rows.length; i += 1) {
      for (let j = i + 1; j < g.rows.length; j += 1) {
        const a = g.rows[i]
        const b = g.rows[j]
        const sameCluster = g.clusters.some((c) => c.units.includes(a) && c.units.includes(b))
        if (sameCluster) continue
        pairs.push({ a, b, ...classifyPair(a, b) })
      }
    }

    // cluster 간 최소 거리
    const clusterDistances = []
    for (let i = 0; i < g.clusters.length; i += 1) {
      for (let j = i + 1; j < g.clusters.length; j += 1) {
        let min = Infinity
        for (const x of g.clusters[i].units) for (const y of g.clusters[j].units) min = Math.min(min, haversineMeters(x, y))
        clusterDistances.push({ i, j, minM: min })
      }
    }

    let maxDistanceM = 0
    for (let i = 0; i < g.rows.length; i += 1) {
      for (let j = i + 1; j < g.rows.length; j += 1) {
        maxDistanceM = Math.max(maxDistanceM, haversineMeters(g.rows[i], g.rows[j]))
      }
    }

    const districts = [...new Set(g.rows.map((u) => u.district?.districtCode).filter(Boolean))]
    const causeCodes = [...new Set(pairs.flatMap((p) => p.causes))].sort()

    const fpInfo = fingerprintByKey.get(key)
    if (!fpInfo) throw new Error(`candidate group "${key}" 의 fingerprint 를 찾을 수 없습니다 (mergeStations 결과와 불일치).`)

    groups.push({
      reviewId: fpInfo.reviewId,
      fingerprint: fpInfo.fingerprint,
      key,
      rows: g.rows,
      clusters: g.clusters,
      pairs,
      clusterDistances,
      maxDistanceM,
      districts,
      causeCodes,
    })
  }

  groups.sort((a, b) => b.maxDistanceM - a.maxDistanceM || a.key.localeCompare(b.key))
  return groups
}

// ========================================
function markdown(groups, stats) {
  const L = []
  L.push('# 역 병합 수동 검수 inventory')
  L.push('')
  L.push('자동 병합이 `hold` 로 남긴 candidate group 전수입니다. **자동 판정은 여기서 끝났고,')
  L.push('아래 각 group 에 대해 사람이 `CONFIRMED_MERGE` / `CONFIRMED_SPLIT` / `MIXED` 를 정해야 합니다.**')
  L.push('')
  L.push('> `hold` 는 "자동 병합을 하지 않은 것이 안전했다"는 뜻이지')
  L.push('> "최종 station master 에서도 별도 역으로 남겨야 한다"는 뜻이 아닙니다.')
  L.push('')
  L.push('| 지표 | 값 |')
  L.push('| --- | --- |')
  L.push(`| 검수 대상 candidate group | ${stats.groupCount} |`)
  L.push(`| hold cluster | ${stats.holdClusterCount} |`)
  L.push(`| unresolved pair | ${stats.unresolvedPairCount} |`)
  L.push(`| source row | ${stats.sourceRowCount} |`)
  L.push('')
  L.push('사유 코드: `missing_transfer_code`(환승노선번호 공란) · `missing_counterpart`(상대 노선 미기재) ·')
  L.push('`source_value_conflict`(코드와 이름이 다른 노선을 가리킴) · `non_transfer_flag`(환승역 아님) ·')
  L.push('`intentional_identity_separation`(이번 시드에서 의도적으로 안 묶은 identity) ·')
  L.push('`distance_over_threshold`(1.5km 초과)')
  L.push('')
  L.push('---')

  for (const g of groups) {
    L.push('')
    L.push(`## ${g.reviewId} — ${g.rows[0].mainName} (\`${g.key}\`)`)
    L.push('')
    L.push(`- fingerprint: \`${g.fingerprint}\``)
    L.push(`  (manual-overrides.mjs 에 이 값을 그대로 붙여넣는다. 다음 실행에서 이 값이 바뀌면 재검토 대상이다.)`)
    L.push(`- source row **${g.rows.length}** / cluster **${g.clusters.length}** / unresolved pair **${g.pairs.length}**`)
    L.push(`- group 내 최대 거리 **${Math.round(g.maxDistanceM)}m** / district **${g.districts.length}종** (${g.districts.join(', ')})`)
    L.push(`- 사유: ${g.causeCodes.map((c) => `\`${c}\``).join(' , ')}`)
    L.push('')
    L.push('### source rows')
    L.push('')
    L.push('MIXED override 를 쓸 때는 `source_row_key` 열의 값을 partition 에 그대로 옮겨 적는다.')
    L.push('')
    L.push('| source_row_key | raw_name | main | sub | 역번호 | source line | raw 노선명 | identity | 환승 | raw transfer codes | acceptable identities | lat | lng | district |')
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const u of g.rows) {
      L.push(`| \`${u.sourceRowKey}\` | ${u.rawName} | ${u.mainName} | ${u.subName ?? ''} | ${u.stationCode} | ${u.lineCode} | ${u.lineName} | \`${u.lineIdentity}\` | ${u.isTransferRaw} | ${u.transferLineCodes.join(' ') || '(공란)'} | ${[...u.transferIdentities].join(' ') || '(없음)'} | ${u.lat} | ${u.lng} | ${u.district?.districtCode ?? ''} |`)
    }
    L.push('')
    L.push('### 현재 cluster 구성')
    L.push('')
    g.clusters.forEach((c, i) => {
      L.push(`- **cluster ${i + 1}** [${c.decision}] — ${c.units.map((u) => `${u.lineName}(\`${u.lineIdentity}\`)`).join(' + ')}  · 대표좌표 \`${c.coordFromIdentity}\` · spread ${Math.round(c.coordSpreadM)}m`)
    })
    if (g.clusterDistances.length > 0) {
      L.push('')
      L.push('cluster 간 최소 거리: ' + g.clusterDistances.map((d) => `cluster${d.i + 1}↔cluster${d.j + 1} ${Math.round(d.minM)}m`).join(' · '))
    }
    L.push('')
    L.push('### unresolved pair')
    L.push('')
    L.push('| A identity | B identity | 거리 | A→B | B→A | 사유 |')
    L.push('| --- | --- | --- | --- | --- | --- |')
    for (const p of g.pairs) {
      L.push(`| \`${p.a.lineIdentity}\` (${p.a.lineName}) | \`${p.b.lineIdentity}\` (${p.b.lineName}) | ${Math.round(p.distanceM)}m | ${p.aHasB ? 'OK' : 'MISS'} | ${p.bHasA ? 'OK' : 'MISS'} | ${p.causes.join(', ')} |`)
    }
    L.push('')
    L.push('### 판단')
    L.push('')
    L.push('| 항목 | 값 |')
    L.push('| --- | --- |')
    L.push('| 자동 판정 | `HOLD` |')
    L.push('| 사람 결정 | ` ` ← `CONFIRMED_MERGE` / `CONFIRMED_SPLIT` / `MIXED` |')
    L.push('| MIXED 시 병합 구성 | ` ` |')
    L.push('| 근거 메모 | ` ` |')
    L.push('')
    L.push('---')
  }

  return L.join('\n')
}

// ========================================
async function main() {
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch { /* 셸 환경변수만 쓰는 경우 */ }

  const railwayPath = await findSourceFile(sourceFiles.railwayStandard, '전국도시철도역사정보표준데이터')
  const railway = await loadRailwayStandard(railwayPath)

  const { minLat, maxLat, minLng, maxLng } = regionFilter.bbox
  const inBox = railway.units.filter((u) => u.lat >= minLat && u.lat <= maxLat && u.lng >= minLng && u.lng <= maxLng)

  const resolver = await createRegionResolver({ enabled: true })
  for (const u of inBox) u.district = await resolver.resolve(u.lat, u.lng)
  await resolver.persist()

  const units = inBox.filter((u) => u.district && regionFilter.sidoCodes.includes(u.district.districtCode.slice(0, 2)))
  annotateIdentities(units)
  // override 는 넘기지 않는다 - 이 스크립트는 사람이 판정할 재료(reviewId/fingerprint)를
  // 내놓는 단계이고, 판정을 적용하는 것은 run.mjs(실제 시드 준비) 의 책임이다.
  const { stations, groups: mergeGroupReports } = mergeStations(units)

  const groups = buildGroups(units, stations, mergeGroupReports)
  const stats = {
    groupCount: groups.length,
    holdClusterCount: stations.filter((s) => s.decision === 'hold').length,
    needsReviewClusterCount: stations.filter((s) => s.needsReview).length,
    unresolvedPairCount: groups.reduce((a, g) => a + g.pairs.length, 0),
    sourceRowCount: groups.reduce((a, g) => a + g.rows.length, 0),
  }

  await mkdir(outputDir, { recursive: true })

  await writeFile(path.join(outputDir, 'manual_review_inventory.md'), markdown(groups, stats), 'utf-8')

  await writeCsv(
    path.join(outputDir, 'manual_review_inventory.csv'),
    ['review_id', 'fingerprint', 'candidate_name', 'source_row_count', 'cluster_count', 'unresolved_pair_count',
      'max_distance_m', 'district_count', 'cause_codes', 'raw_station_names', 'line_identities',
      'source_row_keys', 'current_decision'],
    groups.map((g) => ({
      review_id: g.reviewId,
      fingerprint: g.fingerprint,
      candidate_name: g.rows[0].mainName,
      source_row_count: g.rows.length,
      cluster_count: g.clusters.length,
      unresolved_pair_count: g.pairs.length,
      max_distance_m: Math.round(g.maxDistanceM),
      district_count: g.districts.length,
      cause_codes: g.causeCodes.join(' '),
      raw_station_names: [...new Set(g.rows.map((u) => u.rawName))].join(' | '),
      line_identities: g.rows.map((u) => u.lineIdentity).join(' '),
      // MIXED override 를 쓸 때 partition 에 그대로 옮겨 적을 수 있도록 원문을 남긴다.
      source_row_keys: g.rows.map((u) => u.sourceRowKey).join(' | '),
      current_decision: 'HOLD',
    })),
  )

  await writeCsv(
    path.join(outputDir, 'manual_review_pairs.csv'),
    ['review_id', 'candidate_name', 'a_raw_name', 'a_line_name', 'a_identity', 'a_transfer_flag', 'a_transfer_codes',
      'b_raw_name', 'b_line_name', 'b_identity', 'b_transfer_flag', 'b_transfer_codes',
      'distance_m', 'a_to_b', 'b_to_a', 'cause_codes'],
    groups.flatMap((g) => g.pairs.map((p) => ({
      review_id: g.reviewId,
      candidate_name: g.rows[0].mainName,
      a_raw_name: p.a.rawName, a_line_name: p.a.lineName, a_identity: p.a.lineIdentity,
      a_transfer_flag: p.a.isTransferRaw, a_transfer_codes: p.a.transferLineCodes.join(' '),
      b_raw_name: p.b.rawName, b_line_name: p.b.lineName, b_identity: p.b.lineIdentity,
      b_transfer_flag: p.b.isTransferRaw, b_transfer_codes: p.b.transferLineCodes.join(' '),
      distance_m: Math.round(p.distanceM),
      a_to_b: p.aHasB ? 'OK' : 'MISS',
      b_to_a: p.bHasA ? 'OK' : 'MISS',
      cause_codes: p.causes.join(' '),
    }))),
  )

  console.log(`검수 대상 candidate group ${stats.groupCount}`)
  console.log(`hold cluster ${stats.holdClusterCount} / needs_review cluster ${stats.needsReviewClusterCount}`)
  console.log(`unresolved pair ${stats.unresolvedPairCount} / source row ${stats.sourceRowCount}`)
  console.log(`\n출력: ${outputDir}`)
  console.log('  manual_review_inventory.md / .csv / manual_review_pairs.csv')
  console.log('\n★ CONFIRMED_MERGE / CONFIRMED_SPLIT / MIXED 는 비어 있다. 사람이 채운다.')

  // 통계
  const dist = {}
  for (const g of groups) {
    const k = g.clusters.length >= 4 ? '4+' : String(g.clusters.length)
    dist[k] = (dist[k] ?? 0) + 1
  }
  console.log(`\ncluster_count 분포: ${JSON.stringify(dist)}`)
  const byCause = {}
  for (const g of groups) for (const c of g.causeCodes) byCause[c] = (byCause[c] ?? 0) + 1
  console.log('cause 별 group 수:')
  for (const [c, n] of Object.entries(byCause).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`)
  console.log(`복수 district group: ${groups.filter((g) => g.districts.length > 1).length}`)
  console.log('\ncluster 간 최대 거리 상위 20:')
  for (const g of groups.slice(0, 20)) console.log(`  ${String(Math.round(g.maxDistanceM)).padStart(5)}m  ${g.reviewId} ${g.rows[0].mainName} (row ${g.rows.length}/cluster ${g.clusters.length})`)
  console.log('\nMIXED 가능성 (source row 3개 이상):')
  for (const g of groups.filter((x) => x.rows.length >= 3)) console.log(`  ${g.reviewId} ${g.rows[0].mainName} — row ${g.rows.length} / cluster ${g.clusters.length}: ${g.clusters.map((c) => c.units.map((u) => u.lineName).join('+')).join(' | ')}`)
  console.log('\nsmoke check:')
  for (const nm of ['신촌', '광운대', '신설동', '신논현', '보라매', '김포공항', '공덕', '종로3가', '강남', '중랑']) {
    const g = groups.find((x) => x.rows[0].mainName.startsWith(nm) || x.key.startsWith(nm))
    console.log(`  ${nm.padEnd(8)} ${g ? `${g.reviewId} row ${g.rows.length}/cluster ${g.clusters.length}/pair ${g.pairs.length} [${g.causeCodes.join(',')}]` : '★ 누락'}`)
  }
  void dataDir
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}\n`)
  process.exitCode = 1
})
