// merge_report.csv 생성.
//
// 열 구성의 뼈대는 migration_025_stations_lines.sql:41-43 이다.
// [C] district 를 그룹핑에서 빼면서 한 역이 복수 구를 가질 수 있게 되어,
// district 열은 단일 값이 아니라 목록을 담는다. 열 이름과 개수는 그대로 둔다
// (025 주석이 이 열 목록을 가리키고 있다).

import { writeCsv } from './lib/csv.mjs'

export const REPORT_COLUMNS = [
  'canonical_key',
  'name_ko',
  'district',
  'merged_line_count',
  'merged_lines',
  'station_codes',
  'coord_spread_m',
  'name_variants',
  'official_transfer_flag',
  'transfer_line_match',
  'operator_differs',
  'ja_missing',
  'zh_missing',
  'decision',
  'needs_review',
  'review_reason',
]

function officialTransferFlag(units) {
  const flags = new Set(units.map((u) => (u.isTransfer ? 'Y' : 'N')))
  if (flags.size > 1) return 'mixed'
  return [...flags][0] ?? ''
}

/** 클러스터 안의 모든 쌍이 규칙 (5)를 만족하는가. 단일 노선 역은 판정 대상이 아니다. */
function transferLineMatchWithin(units) {
  if (units.length < 2) return 'n/a'
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const a = units[i]
      const b = units[j]
      if (!a.transferIdentities.has(b.lineIdentity)) return 'false'
      if (!b.transferIdentities.has(a.lineIdentity)) return 'false'
    }
  }
  return 'true'
}

function districtCell(districts) {
  if (!districts || districts.length === 0) return '(미해결)'
  // 첫 번째가 대표 좌표가 속한 구다. 복수면 전부 남긴다 - station_districts 다대다 입력 후보.
  return districts.map((d) => `${d.districtCode} ${d.districtName ?? ''}`.trim()).join(' | ')
}

export function buildReportRows(stations) {
  const rows = stations.map((s) => ({
    canonical_key: s.candidateKey,
    name_ko: s.nameKo,
    district: districtCell(s.districts),
    merged_line_count: s.lineNames.length,
    merged_lines: s.lineNames.join(' · '),
    station_codes: s.stationCodes.join(' '),
    coord_spread_m: Math.round(s.coordSpreadM),
    // raw_name / main_name / sub_name 을 전부 남긴다. 시드 SQL 의 alias 후보다.
    name_variants: [s.nameKo, ...s.aliasCandidates].join(' | '),
    official_transfer_flag: officialTransferFlag(s.units),
    transfer_line_match: transferLineMatchWithin(s.units),
    operator_differs: s.operators.length > 1,
    ja_missing: !s.nameJa,
    zh_missing: !s.nameZh,
    decision: s.decision,
    needs_review: s.needsReview,
    review_reason: s.reviewReason,
  }))

  rows.sort((a, b) => {
    if (b.coord_spread_m !== a.coord_spread_m) return b.coord_spread_m - a.coord_spread_m
    return a.canonical_key.localeCompare(b.canonical_key)
  })

  return rows
}

export async function writeReport(filePath, stations) {
  const rows = buildReportRows(stations)
  await writeCsv(filePath, REPORT_COLUMNS, rows)
  return {
    total: rows.length,
    needsReview: rows.filter((r) => r.needs_review).length,
    byDecision: rows.reduce((acc, r) => {
      acc[r.decision] = (acc[r.decision] ?? 0) + 1
      return acc
    }, {}),
    jaMissing: rows.filter((r) => r.ja_missing).length,
    zhMissing: rows.filter((r) => r.zh_missing).length,
    multiDistrict: stations.filter((s) => s.districts.length > 1).length,
  }
}
