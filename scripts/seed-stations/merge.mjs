// 역-노선 단위 레코드를 "고객이 고르는 하나의 지점"(stations 1행)으로 합친다.
//
// 규칙의 출처는 migration_025_stations_lines.sql 설계 의도 (2) 다.
//
//   [병합 확정 조건] 아래를 전부 충족해야 자동 병합한다:
//     (1) 정규화 역명 일치            <- candidate grouping 으로 보장
//     (2) primary district 일치       <- ★ 제거됨. 아래 [C] 참고
//     (3) 좌표 거리 <= COORD_MERGE_MAX_M
//     (4) 표준데이터의 환승역 구분이 환승역
//     (5) 표준데이터의 환승 노선에 상대 노선이 포함 (양방향)
//
// ─────────────────────────────────────────────────────────────────
// [C] district 를 candidate grouping key 에서 뺀 이유
//
//   025 는 "정규화 역명 + primary district" 를 그룹핑 키로 정의했지만, 실데이터에서
//   하나의 환승역이 구 경계에 걸쳐 조용히 갈라졌다(서울역=중구/용산구, 사당=동작구/관악구,
//   신설동·대림·동작·총신대입구·신논현·보라매 포함 8개 역명).
//   갈라진 결과가 전부 single + needs_review=false 라서 검수 리포트에도 걸리지 않았다.
//
//   -> candidate group 은 normalize(main_name) 만으로 만든다.
//      district 는 병합이 끝난 뒤 수집하며, 하나의 병합 station 이 복수 district 를
//      가질 수 있다. 이것이 station_districts 다대다 시드의 입력 후보다.
//      is_primary 규칙은 이번에 바꾸지 않는다.
// ─────────────────────────────────────────────────────────────────
//
// ★ 이름으로 예외 처리하는 코드를 넣지 않는다.
//   신촌(2호선/경의중앙선)은 [D] 분해로 같은 candidate group 에 들어온 뒤
//   (4)(5)에서 걸려 hold 가 된다. 특정 역명을 하드코딩하면 규칙이 실제로 동작하는지
//   확인할 수 없게 되고, 같은 성질의 다른 역을 놓친다.

import { COORD_MERGE_MAX_M } from './config.mjs'
import { groupFingerprint } from './lib/fingerprint.mjs'
import { haversineMeters, maxPairwiseMeters } from './lib/geo.mjs'
import { reviewId } from './lib/review-id.mjs'
import { assertSourceRowKeysUnique, sourceRowKey } from './lib/source-row-key.mjs'
import { coordinatePriorityOf, lineIdentityOf, transferIdentitiesOf } from './line-identity.mjs'

function makeUnionFind(size) {
  const parent = Array.from({ length: size }, (_, i) => i)
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  return {
    find,
    union(a, b) {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[rb] = ra
    },
  }
}

/**
 * 단위 레코드에 line identity 를 붙인다. 병합 전에 한 번만 돈다.
 * @returns {{ unresolvedCodes: Map<string, number>, missingPriority: Map<string, number> }}
 */
export function annotateIdentities(units) {
  const knownSourceCodes = new Set(units.map((u) => u.lineCode))
  const unresolvedCodes = new Map()
  const missingPriority = new Map()

  for (const u of units) {
    u.lineIdentity = lineIdentityOf(u)
    const { identities, unresolved } = transferIdentitiesOf(u, knownSourceCodes)
    u.transferIdentities = identities
    u.unresolvedTransferCodes = unresolved
    for (const c of unresolved) unresolvedCodes.set(c, (unresolvedCodes.get(c) ?? 0) + 1)

    u.coordPriority = coordinatePriorityOf(u.lineIdentity)
    if (u.coordPriority === null) {
      missingPriority.set(u.lineIdentity, (missingPriority.get(u.lineIdentity) ?? 0) + 1)
    }

    // override(MIXED partition)와 fingerprint 가 "행 하나"를 가리키는 유일한 방법.
    // array index 를 쓰지 않는 이유는 lib/source-row-key.mjs 참고.
    u.sourceRowKey = sourceRowKey(u)
  }

  // 충돌이 있으면 override/fingerprint 가 서로 다른 행을 같은 행으로 착각하게 되므로 조용히 넘어가지 않는다.
  assertSourceRowKeysUnique(units)

  return { unresolvedCodes, missingPriority }
}

/**
 * [F] 규칙 (3)(4)(5) 판정.
 *
 * (5)는 line identity 집합 멤버십으로만 본다. 환승노선명과 위치로 짝짓지 않는다
 * (왕십리 codes=[S1105,I41K4,I41K1] / names=[5호선,분당,경의중앙] 처럼 순서가 어긋난다).
 * 양방향 요구는 유지한다 - 하나라도 불충족이면 자동 병합 금지다.
 */
function evaluatePair(a, b) {
  const failures = []
  const distanceM = haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })

  // (3)
  if (distanceM > COORD_MERGE_MAX_M) {
    failures.push(`좌표 ${Math.round(distanceM)}m > 임계 ${COORD_MERGE_MAX_M}m`)
  }

  // (4)
  const notTransfer = []
  if (!a.isTransfer) notTransfer.push(`${a.lineName}="${a.isTransferRaw ?? '없음'}"`)
  if (!b.isTransfer) notTransfer.push(`${b.lineName}="${b.isTransferRaw ?? '없음'}"`)
  if (notTransfer.length > 0) failures.push(`환승역 아님(${notTransfer.join(', ')})`)

  // (5)
  const aHasB = a.transferIdentities.has(b.lineIdentity)
  const bHasA = b.transferIdentities.has(a.lineIdentity)
  if (!aHasB || !bHasA) {
    const parts = []
    if (!aHasB) {
      parts.push(
        a.transferLineCodes.length === 0
          ? `${a.lineName}쪽 환승노선번호 공란`
          : `${a.lineName}쪽[${[...a.transferIdentities].join(',') || '해석불가'}]에 ${b.lineIdentity} 없음`,
      )
    }
    if (!bHasA) {
      parts.push(
        b.transferLineCodes.length === 0
          ? `${b.lineName}쪽 환승노선번호 공란`
          : `${b.lineName}쪽[${[...b.transferIdentities].join(',') || '해석불가'}]에 ${a.lineIdentity} 없음`,
      )
    }
    failures.push(`환승노선 불일치(${parts.join(' / ')})`)
  }

  return { ok: failures.length === 0, distanceM, failures }
}

/** 클러스터 -> 병합된 역 1행 */
function buildStation(units) {
  // ★ [E] 대표 좌표는 coordinatePriority 가 가장 낮은(=우선순위 높은) source row 의 실제 좌표다.
  //   평균을 쓰지 않는다. 평균점은 승강장이 먼 환승역에서 어떤 출입구도 아닌 지점이 되고
  //   재적재할 때마다 값이 흔들려 백필·라우팅 결과를 재현할 수 없게 만든다.
  //   lineDisplayOrder(표시 순서)에는 더 이상 의존하지 않는다 - 표시 모델을 나중에 바꿔도
  //   이미 백필된 좌표가 움직이면 안 되기 때문이다.
  //   우선순위 미등록 identity 는 Infinity 로 뒤에 두되 run 이 경고로 보고한다.
  const sorted = [...units].sort((x, y) => {
    const px = x.coordPriority ?? Number.POSITIVE_INFINITY
    const py = y.coordPriority ?? Number.POSITIVE_INFINITY
    if (px !== py) return px - py
    // 동순위 방어: 재실행 결정성을 위해 identity -> 역번호 순으로 깬다
    if (x.lineIdentity !== y.lineIdentity) return x.lineIdentity.localeCompare(y.lineIdentity)
    return String(x.stationCode ?? '').localeCompare(String(y.stationCode ?? ''))
  })

  const primary = sorted[0]
  const firstNonNull = (field) => sorted.find((u) => u[field])?.[field] ?? null

  const rawNames = [...new Set(units.map((u) => u.rawName))]
  const mainNames = [...new Set(units.map((u) => u.mainName))]
  const subNames = [...new Set(units.map((u) => u.subName).filter(Boolean))]

  // [C] district 는 병합 이후 수집한다. 복수일 수 있다.
  const districts = []
  const seenDistrict = new Set()
  for (const u of sorted) {
    if (!u.district) continue
    if (seenDistrict.has(u.district.districtCode)) continue
    seenDistrict.add(u.district.districtCode)
    districts.push({ ...u.district, fromLineIdentity: u.lineIdentity, fromLineName: u.lineName })
  }

  return {
    candidateKey: primary.mainNameNormalized,
    nameKo: primary.mainName,
    nameEn: firstNonNull('nameEn'),
    nameHanja: firstNonNull('nameHanja'),
    nameJa: firstNonNull('nameJa'),
    nameZh: firstNonNull('nameZh'),

    lat: primary.lat,
    lng: primary.lng,
    coordFromLine: primary.lineName,
    coordFromIdentity: primary.lineIdentity,
    coordPriority: primary.coordPriority,

    // 대표 좌표가 속한 구가 첫 번째다. is_primary 규칙은 이번에 바꾸지 않는다.
    districts,

    stationCode: primary.stationCode ?? null,
    stationCodes: units.map((u) => u.stationCode).filter(Boolean),
    lineNames: sorted.map((u) => u.lineName),
    lineIdentities: sorted.map((u) => u.lineIdentity),
    operators: [...new Set(units.map((u) => u.operator).filter(Boolean))],

    rawNames,
    mainNames,
    subNames,
    // 025: 불일치 표기는 버리지 않고 station_aliases 에 kind='legacy' 로 전부 등록한다.
    // 부역명도 여기 포함된다. 실제 검색 노출 여부는 시드 SQL 단계에서 정한다.
    aliasCandidates: [...new Set([...rawNames, ...mainNames, ...subNames])].filter((n) => n !== primary.mainName),

    coordSpreadM: maxPairwiseMeters(units.map((u) => ({ lat: u.lat, lng: u.lng }))),
    units,
  }
}

/**
 * MIXED override 의 partition(sourceRowKey 배열의 배열)을 실제 unit 배열로 바꾼다.
 * 이 함수는 fingerprint 가 이미 일치를 확인한 뒤에만 불린다. 그런데도 키가 안 맞으면
 * override 저작 자체의 오류(오타 등)이므로 stale 처럼 조용히 폴백하지 않고 즉시 중단한다.
 */
function resolveMixedPartition(override, members) {
  const bySourceRowKey = new Map(members.map((u) => [u.sourceRowKey, u]))
  const covered = new Set()

  const result = override.partition.map((keys) => keys.map((k) => {
    if (covered.has(k)) {
      throw new Error(`override ${override.reviewId}: sourceRowKey "${k}" 가 partition 안에서 중복 사용됐습니다.`)
    }
    const u = bySourceRowKey.get(k)
    if (!u) {
      throw new Error(`override ${override.reviewId}: sourceRowKey "${k}" 가 candidate group "${override.candidateName}" 에 없습니다.`)
    }
    covered.add(k)
    return u
  }))

  if (covered.size !== members.length) {
    const missing = members.filter((u) => !covered.has(u.sourceRowKey)).map((u) => u.sourceRowKey)
    throw new Error(`override ${override.reviewId}: partition 이 candidate group 의 모든 행을 덮지 않습니다. 누락: ${missing.join(', ')}`)
  }

  return result
}

/**
 * @param {object[]} units      annotateIdentities() 를 거친 단위 레코드
 * @param {object[]} [overrides]  manual-overrides.mjs 의 판정 목록. 기본값은 빈 배열이다.
 * @returns {{ stations: object[], groups: object[], pairStats: object, overrideAudit: object[], blockingIssues: object[] }}
 */
export function mergeStations(units, overrides = []) {
  // [C] candidate group = normalize(main_name) 만
  const groups = new Map()
  for (const u of units) {
    if (!groups.has(u.mainNameNormalized)) groups.set(u.mainNameNormalized, [])
    groups.get(u.mainNameNormalized).push(u)
  }

  const overridesByReviewId = new Map(overrides.map((o) => [o.reviewId, o]))
  // 이번 실행에서 실제로 존재한 candidate group 의 reviewId 전체 - unused 판정의 기준선이다.
  const matchedReviewIds = new Set()
  const overrideAudit = []
  const blockingIssues = []

  const stations = []
  const groupReports = []
  const pairStats = { total: 0, need5: 0, pass: 0, failBy: new Map(), unresolvedPairs: [] }

  for (const [key, members] of groups) {
    const uf = makeUnionFind(members.length)
    const pairFailures = []
    const allPairResults = [] // fingerprint 전용 - 통과/실패 상관없이 그룹 내 모든 쌍의 ok

    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i]
        const b = members[j]
        const verdict = evaluatePair(a, b)
        pairStats.total += 1
        allPairResults.push({ aKey: a.sourceRowKey, bKey: b.sourceRowKey, ok: verdict.ok })

        // 규칙 (5) 판정이 실제로 필요한 쌍 = (3)(4)를 통과한 쌍
        const passes34 =
          verdict.distanceM <= COORD_MERGE_MAX_M && a.isTransfer && b.isTransfer
        if (passes34) {
          pairStats.need5 += 1
          if (verdict.ok) pairStats.pass += 1
          else pairStats.unresolvedPairs.push({ a, b, distanceM: verdict.distanceM, failures: verdict.failures })
        }

        if (verdict.ok) {
          uf.union(i, j)
        } else {
          for (const f of verdict.failures) {
            const kind = f.startsWith('좌표') ? '(3) 좌표 임계 초과'
              : f.startsWith('환승역 아님') ? '(4) 환승역 아님'
              : '(5) 환승노선 불일치'
            pairStats.failBy.set(kind, (pairStats.failBy.get(kind) ?? 0) + 1)
          }
          pairFailures.push({ a, b, distanceM: verdict.distanceM, failures: verdict.failures })
        }
      }
    }

    const byRoot = new Map()
    members.forEach((u, i) => {
      const root = uf.find(i)
      if (!byRoot.has(root)) byRoot.set(root, [])
      byRoot.get(root).push(u)
    })
    const automaticClusterUnitArrays = [...byRoot.values()]

    // ─────────────────────────────────────────────────────────────
    // override layer - evaluatePair()/union-find(자동 판정)가 이미 끝난 뒤에만 개입한다.
    // evaluatePair() 자체는 절대 건드리지 않는다. 특정 역명으로 자동 규칙을 바꾸는 코드가 아니다.
    // ─────────────────────────────────────────────────────────────
    const id = reviewId(key)
    const fingerprint = groupFingerprint({
      rows: members,
      automaticClusters: automaticClusterUnitArrays,
      pairResults: allPairResults,
    })
    matchedReviewIds.add(id)

    let finalClusterUnitArrays = automaticClusterUnitArrays
    let overrideResult = null // { status: 'applied' | 'stale', record }

    const override = overridesByReviewId.get(id)
    if (override) {
      if (override.fingerprint === fingerprint) {
        finalClusterUnitArrays = override.verdict === 'CONFIRMED_MERGE' ? [members]
          : override.verdict === 'CONFIRMED_SPLIT' ? automaticClusterUnitArrays
          : resolveMixedPartition(override, members)
        overrideResult = { status: 'applied', record: override }
      } else {
        // ★ 불일치 - 절대 적용하지 않는다. 자동 판정(hold 등)을 그대로 안전한 기본값으로 유지하고,
        //   run.mjs 가 blockingIssues 를 보고 hard fail 시킨다.
        overrideResult = { status: 'stale', record: override }
        blockingIssues.push({
          kind: 'stale',
          reviewId: id,
          candidateName: members[0].mainName,
          storedFingerprint: override.fingerprint,
          currentFingerprint: fingerprint,
        })
      }

      overrideAudit.push({
        review_id: id,
        candidate_name: members[0].mainName,
        verdict: override.verdict,
        status: overrideResult.status,
        stored_fingerprint: override.fingerprint,
        current_fingerprint: fingerprint,
        automatic_cluster_count: automaticClusterUnitArrays.length,
        final_cluster_count: finalClusterUnitArrays.length,
        note: override.note,
        partition_summary: override.verdict === 'MIXED' ? override.partition.map((g) => g.join('+')).join(' | ') : '',
      })
    }

    const clusters = finalClusterUnitArrays.map((cu) => buildStation(cu))
    const isHold = clusters.length > 1

    for (const cluster of clusters) {
      const reasons = []

      if (isHold) {
        const mine = new Set(cluster.units)
        const related = pairFailures.filter((f) => mine.has(f.a) !== mine.has(f.b))
        const seen = new Set()
        for (const f of related) {
          const text = `${f.a.lineName}↔${f.b.lineName} ${Math.round(f.distanceM)}m: ${f.failures.join(' / ')}`
          if (!seen.has(text)) {
            seen.add(text)
            reasons.push(text)
          }
        }
        if (reasons.length === 0) reasons.push('같은 이름의 다른 역과 병합되지 않음')
      }

      // 전이적 병합(A-B, B-C 는 각각 임계 이내인데 A-C 는 아님)
      if (cluster.units.length > 1 && cluster.coordSpreadM > COORD_MERGE_MAX_M) {
        reasons.push(
          `병합됐지만 실제 퍼짐 ${Math.round(cluster.coordSpreadM)}m > 임계 ${COORD_MERGE_MAX_M}m (전이적 병합)`,
        )
      }

      const unresolvedCodes = [...new Set(cluster.units.flatMap((u) => u.unresolvedTransferCodes))]
      if (unresolvedCodes.length > 0) {
        reasons.push(`해석되지 않은 환승노선번호: ${unresolvedCodes.join(', ')}`)
      }

      cluster.decision = isHold ? 'hold' : cluster.units.length > 1 ? 'merge' : 'single'
      cluster.needsReview = reasons.length > 0
      cluster.reviewReason = reasons.join(' | ')
      cluster.candidateKey = key
      cluster.groupClusterCount = clusters.length

      // ★ fingerprint 가 일치해 실제로 적용된 override 만 최종 표시를 덮어쓴다.
      //   stale 인 경우는 자동 판정 그대로 두고(안전한 기본값) run.mjs 가 별도로 hard fail 시킨다.
      //   REPORT_COLUMNS 에는 없는 값이라 review_reason 안에 [OVERRIDE ...] 접두사로만 남긴다 -
      //   note 전문은 여기 복제하지 않는다(manual-overrides.mjs/override_audit.csv 가 상세를 갖는다).
      if (overrideResult?.status === 'applied') {
        cluster.needsReview = false
        cluster.reviewReason = `[OVERRIDE ${id} ${overrideResult.record.verdict}] ${cluster.reviewReason}`.trim()
      }
      cluster.overrideStatus = overrideResult?.status ?? null
      cluster.reviewId = id

      stations.push(cluster)
    }

    groupReports.push({ key, memberCount: members.length, clusterCount: clusters.length, reviewId: id, fingerprint })
  }

  // ★ unused - override 의 reviewId 가 이번 실행의 어떤 candidate group 에도 없다.
  //   역명 표기가 바뀌어 reviewId 가 달라진 경우가 대부분이며, 그러면 해당 역은 override 없이
  //   자동 판정으로 조용히 시드에 들어간다(예: 김포공항이 갈린 채로). hard fail 로 반드시 드러낸다.
  for (const override of overrides) {
    if (matchedReviewIds.has(override.reviewId)) continue
    blockingIssues.push({ kind: 'unused', reviewId: override.reviewId, candidateName: override.candidateName })
    overrideAudit.push({
      review_id: override.reviewId,
      candidate_name: override.candidateName,
      verdict: override.verdict,
      status: 'unused',
      stored_fingerprint: override.fingerprint,
      current_fingerprint: '',
      automatic_cluster_count: '',
      final_cluster_count: '',
      note: override.note,
      partition_summary: override.verdict === 'MIXED' ? override.partition.map((g) => g.join('+')).join(' | ') : '',
    })
  }

  return { stations, groups: groupReports, pairStats, overrideAudit, blockingIssues }
}

/**
 * 서울교통공사 다국어 표기를 병합 결과에 붙인다.
 * 표준데이터에 없는 ja/zh 만 채우고, 없는 역은 null 로 둔다(추측 금지).
 */
export function attachI18n(stations, i18nByName) {
  let matched = 0
  const unmatched = []

  for (const station of stations) {
    const keys = [...new Set(station.units.map((u) => u.mainNameNormalized))]
    const hit = keys.map((k) => i18nByName.get(k)).find(Boolean)

    if (!hit) {
      unmatched.push(station.nameKo)
      continue
    }

    matched += 1
    if (!station.nameJa && hit.nameJa) station.nameJa = hit.nameJa
    if (!station.nameZh && hit.nameZh) station.nameZh = hit.nameZh
    if (!station.nameEn && hit.nameEn) station.nameEn = hit.nameEn

    for (const variant of hit.variants) {
      if (variant !== station.nameKo && !station.aliasCandidates.includes(variant)) {
        station.aliasCandidates.push(variant)
      }
    }
  }

  return { matched, unmatched }
}
