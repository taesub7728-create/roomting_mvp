// migration_029 의 RPC 가 돌려주는 지역 표시값을 한 줄 문자열로 만든다.
//
// 029 는 requests.region_text 를 반환하지 않는다(029:77-80). 사용자 언어로 적힌 표시
// 문자열이라 위조가 가능하고, 중개사 화면은 한국어이기 때문이다. 대신 서버가 stations 에서
// 만든 station_name_ko / line_names / district_name_ko 를 준다.
//
// 표기는 자동완성(StationAutocomplete)과 같은 형태를 쓴다 - 고객이 고른 화면과 중개사가
// 보는 화면이 같은 문자열을 보여야 한다.
//   홍대입구 · 2호선 · 경의중앙선 · 공항철도

/**
 * @param {{ station_name_ko?: string|null, line_names?: string[]|null, district_name_ko?: string|null }} row
 * @param {{ fallback?: string }} options RPC 가 아직 값을 못 주는 경우에 쓸 문자열
 */
export function stationLabel(row, { fallback = '' } = {}) {
  if (!row) return fallback
  const name = row.station_name_ko
  if (!name) return fallback
  const lines = Array.isArray(row.line_names) ? row.line_names.filter(Boolean) : []
  return [name, ...lines].join(' · ')
}

/** 검색·필터에 쓸 문자열. 역명·노선명·구 이름을 한 덩어리로 합친다. */
export function stationSearchText(row) {
  if (!row) return ''
  const lines = Array.isArray(row.line_names) ? row.line_names.filter(Boolean) : []
  return [row.station_name_ko, ...lines, row.district_name_ko].filter(Boolean).join(' ')
}
