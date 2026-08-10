// 마법사 form(draft)의 초기값. RequestWizard.jsx 안에 있던 상수를 별도 모듈로 뺀 것이다.
//
// 분리 이유: restoreRequestForm()이 "payload에 없는 필드는 기본값으로 채운다"는 규칙 때문에
// 이 값을 필요로 하는데, RequestWizard.jsx에서 가져오면 RequestWizard -> restoreRequestForm ->
// RequestWizard 순환 import가 된다. 값 자체는 그대로이고 위치만 옮겼다.
export const DEFAULT_FORM = {
  // 사용자가 보는 지역 문자열. 그대로 requests.region_text 가 된다(표시용, 라우팅에 쓰지 않는다).
  station: '',
  // 자동완성 목록에서 실제로 고른 역의 id. 고르지 않았으면 null 이다.
  // ★ station 텍스트를 직접 고치면 반드시 null 로 되돌린다(StationAutocomplete 참고).
  //   032 적용 전까지는 null 이어도 제출된다 - 027 트리거가 통과시킨다.
  stationId: null,
  dealType: 'rent',
  rent: 70,
  deposit: 1000,
  jeonseDepositMin: null,
  jeonseDepositMax: null,
  jeonseLoanPlanned: null,
  jeonseLoanDetail: '',
  roomTypes: [],
  jeonip: false,
  moveInDate: '',
  contractMonths: 6,
  amenities: [],
  extraNote: '',
}
