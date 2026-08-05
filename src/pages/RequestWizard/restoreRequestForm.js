import { DEFAULT_FORM } from './formDefaults'

// buildRequestPayload()의 역변환. 제출에 실패해 PENDING_REQUEST_KEY에 남아 있는 payload를
// 마법사 form 상태로 되돌린다(editable 실패 시 "요청서 수정" 흐름에서 사용).
//
// 설계 원칙 세 가지:
//
// 1. 잘못된 값을 "고쳐서" 복원하지 않는다.
//    이 함수가 쓰이는 상황 자체가 DB CHECK 위반 등으로 제출이 거부된 경우다. 사용자는 자기가
//    무엇을 입력했는지 보고 그걸 고쳐야 한다. 그래서 0이나 범위 역전 같은 "유효하지 않지만
//    사용자가 실제로 입력한 값"은 그대로 되살린다 - 화면의 인라인 검증이 무엇이 문제인지
//    알려주고, validateRequest()가 제출을 막는다. 여기서 조용히 정상값으로 바꿔버리면
//    사용자는 자기가 뭘 잘못 입력했는지 영영 모른다.
//
// 2. 타입이 깨진 값만 기본값으로 대체한다.
//    payload는 localStorage를 거쳐 오고 classifyStoredPending()은 래퍼(savedAt/payload)만
//    검사할 뿐 내부 필드는 보지 않는다. 문자열이어야 할 자리에 객체가 들어있는 식의 손상은
//    복원 자체를 깨뜨리므로 기본값으로 떨어뜨린다.
//
// 3. 복원 불가능한 손실은 숨기지 않고 신고한다.
//    전세로 제출된 payload에는 월세(rent) 값이 아예 없다(buildRequestPayload가 제출 시점에
//    null로 정규화한다). 되살릴 원본이 존재하지 않으므로 기본값 70이 들어간다 - 이건 복원이
//    아니라 날조에 가까우므로 rentFallbackApplied로 알려서 호출부가 사용자에게 안내하게 한다.

// 유한한 숫자만 통과시킨다. 0이나 음수도 "사용자가 입력한 값"이므로 그대로 살린다(원칙 1).
function toAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toText(value) {
  return typeof value === 'string' ? value : ''
}

// 문자열 코드 배열만 통과. 배열이 아니거나 원소에 문자열이 아닌 게 섞이면 그 원소만 버린다.
function toCodeList(value) {
  return Array.isArray(value) ? value.filter((code) => typeof code === 'string') : []
}

export function restoreRequestForm(payload) {
  const safe = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}

  // dealType은 두 값만 유효하다. 알 수 없는 값이면 어느 쪽 필드를 살릴지 판단할 수 없으므로
  // 기본값(rent)으로 떨어뜨린다.
  const dealType = safe.dealType === 'jeonse' || safe.dealType === 'rent' ? safe.dealType : DEFAULT_FORM.dealType
  const isJeonse = dealType === 'jeonse'

  // 전세 payload에는 rent/deposit(월세 슬라이더 값)이 담기지 않는다 - 복원할 원본이 없다.
  const rentFallbackApplied = isJeonse

  const restoredRent = toAmount(safe.rentMax)
  const restoredDepositMax = toAmount(safe.depositMax)

  const form = {
    station: toText(safe.regionText),
    dealType,

    // 월세 슬라이더: 월세로 제출됐을 때만 원값이 있다. 전세였다면 기본값(원칙 3).
    rent: !isJeonse && restoredRent != null ? restoredRent : DEFAULT_FORM.rent,
    deposit: !isJeonse && restoredDepositMax != null ? restoredDepositMax : DEFAULT_FORM.deposit,

    // 전세 보증금: depositMax는 월세/전세가 공용으로 쓰는 컬럼이라 dealType으로 갈라야 한다.
    // depositMin은 전세 전용이다(월세 제출 시 buildRequestPayload가 항상 null로 넣는다).
    jeonseDepositMax: isJeonse ? restoredDepositMax : null,
    jeonseDepositMin: isJeonse ? toAmount(safe.depositMin) : null,

    // true/false/null 3상태. 그 외 타입은 미선택(null)으로 본다.
    jeonseLoanPlanned:
      isJeonse && (safe.jeonseLoanPlanned === true || safe.jeonseLoanPlanned === false)
        ? safe.jeonseLoanPlanned
        : null,
    // DB에는 null로 저장되지만 입력 컨트롤은 controlled input이라 빈 문자열이어야 한다.
    jeonseLoanDetail: toText(safe.jeonseLoanDetail),

    roomTypes: toCodeList(safe.roomTypes),
    amenities: toCodeList(safe.amenities),

    contractMonths: toAmount(safe.contractMonths) ?? DEFAULT_FORM.contractMonths,
    extraNote: toText(safe.extraNote),
    // 형식이 깨진 날짜라도 문자열이면 그대로 살린다 - validateRequest()가 이유를 알려준다(원칙 1).
    moveInDate: toText(safe.moveInDate),
    jeonip: safe.registrationRequired === true,
  }

  return { form, rentFallbackApplied }
}
