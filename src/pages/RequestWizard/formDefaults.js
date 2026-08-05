// 마법사 form(draft)의 초기값. RequestWizard.jsx 안에 있던 상수를 별도 모듈로 뺀 것이다.
//
// 분리 이유: restoreRequestForm()이 "payload에 없는 필드는 기본값으로 채운다"는 규칙 때문에
// 이 값을 필요로 하는데, RequestWizard.jsx에서 가져오면 RequestWizard -> restoreRequestForm ->
// RequestWizard 순환 import가 된다. 값 자체는 그대로이고 위치만 옮겼다.
export const DEFAULT_FORM = {
  station: '',
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
