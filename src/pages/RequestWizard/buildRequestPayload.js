// RequestWizard의 form(draft) 상태를 createRequest()에 넘길 payload로 정규화하는 단일 지점.
// - 월세일 때 전세 관련 필드(rent/deposit 슬라이더 값) 유지, 전세 필드는 전부 null 정규화
// - 전세일 때 rent_max(=rent) null 정규화, deposit_min/max는 전세 입력값 사용
// - property_category는 이번 UI가 residential만 생성하므로 항상 고정
// - 전세대출 미이용(false) 선택 시 상세 텍스트는 항상 null로 정규화(DB CHECK와 동일한 규칙)
export function buildRequestPayload(form) {
  const isJeonse = form.dealType === 'jeonse'

  return {
    regionText: form.station.trim(),
    propertyCategory: 'residential',
    dealType: form.dealType,
    rentMax: isJeonse ? null : form.rent,
    depositMax: isJeonse ? form.jeonseDepositMax : form.deposit,
    depositMin: isJeonse ? form.jeonseDepositMin : null,
    jeonseLoanPlanned: isJeonse ? form.jeonseLoanPlanned : null,
    jeonseLoanDetail: isJeonse && form.jeonseLoanPlanned ? (form.jeonseLoanDetail.trim() || null) : null,
    roomTypes: form.roomTypes,
    contractMonths: form.contractMonths,
    amenities: form.amenities,
    extraNote: form.extraNote,
    moveInDate: form.moveInDate,
    registrationRequired: form.jeonip,
  }
}
