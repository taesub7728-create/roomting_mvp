// merge_report.csv 의 name_variants 중 검색 별칭으로 쓰면 안 되는 값. 사람이 검수해 확정했다.
//
// ★ station + alias 조합으로 판정한다. 전역 문자열 비교가 아니다.
//   같은 문자열이 다른 station 의 정당한 별칭으로 나타나도 그쪽은 제외되지 않는다.
//   (예: '경의선' 을 전역 제외하면 나중에 어떤 역의 정당한 별칭까지 조용히 사라진다)
//
// ★ fingerprint 시스템을 두지 않는 이유
//   manual-overrides.mjs 가 fingerprint 를 쓰는 이유는 원본 공공데이터가 재다운로드로
//   바뀔 수 있어서다(그룹 내용이 달라지면 과거 판정이 틀려진다). 여기는 상황이 다르다:
//     - 입력이 tracked·frozen 된 merge_report.csv 다. 바뀌면 git diff 로 보인다
//     - station master 가 동결 상태다
//     - 항목이 2건이다
//   대신 stale 방어를 생성기가 한다: 각 항목이 정확히 1건 매칭하지 않으면 hard fail.
//   0 match / 2+ match / unused 전부 중단이다.

/** @type {Array<{stationNameKo: string, alias: string, reason: string}>} */
export const legacyAliasExclusions = [
  {
    stationNameKo: '신촌',
    alias: '지하',
    reason:
      '일반어이지 역명이 아니다. 원문 "신촌(지하)" 의 괄호 안은 부역명이 아니라 위치 설명이라, ' +
      '부역명 추출 규칙이 그대로 떼어내 후보로 올린 값이다. 별칭으로 넣으면 "지하" 검색에 신촌이 뜬다.',
  },
  {
    stationNameKo: '서울역',
    alias: '경의선',
    reason:
      '노선명이다. 원문 "서울역(경의선)" 의 괄호 안이 부역명이 아니라 노선 구분이다. ' +
      'DB 노선명은 "경의중앙선" 이라 문자열이 달라 노선명 자동 대조로는 걸러지지 않는다(실측 매칭 0건).',
  },
]
