// RequestWizard의 form(draft) 상태를 createRequest()에 넘길 payload로 정규화하는 단일 지점.
// - 월세일 때 전세 관련 필드(rent/deposit 슬라이더 값) 유지, 전세 필드는 전부 null 정규화
// - 전세일 때 rent_max(=rent) null 정규화, deposit_min/max는 전세 입력값 사용
// - property_category는 이번 UI가 residential만 생성하므로 항상 고정
// - 전세대출 미이용(false) 선택 시 상세 텍스트는 항상 null로 정규화(DB CHECK와 동일한 규칙)
export function buildRequestPayload(form) {
  const isJeonse = form.dealType === 'jeonse'

  return {
    regionText: form.station.trim(),
    // 자동완성에서 실제로 고른 경우에만 값이 있다. 자유 입력이면 null 이다(032 전까지 허용).
    // ★ district_code / location_lat / location_lng 는 보내지 않는다.
    //   027 의 fill_request_location() 트리거가 station_id 로 DB master 에서 파생한다.
    //   클라이언트가 보내도 덮어써지지만, 보내는 것 자체가 "이 값을 신뢰한다"는 잘못된 신호다.
    stationId: form.stationId ?? null,
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
