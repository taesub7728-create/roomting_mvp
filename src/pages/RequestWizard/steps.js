import LocationStep from './steps/LocationStep'
import TransactionStep from './steps/TransactionStep'
import RoomTypeStep from './steps/RoomTypeStep'
import MoveInStep from './steps/MoveInStep'
import ExtraStep from './steps/ExtraStep'
import ReviewStep from './steps/ReviewStep'

// 모든 카테고리 공유 - 앞쪽(지역/거래조건)
const headSteps = [
  {
    id: 'location',
    component: LocationStep,
    headlineKey: 'locationHeadline',
    subKey: 'locationSub',
    isApplicable: () => true,
    validate: (form) => form.station.trim().length > 0,
  },
  {
    id: 'transaction',
    component: TransactionStep,
    headlineKey: 'transactionHeadline',
    subKey: 'transactionSub',
    isApplicable: () => true,
    // 전세일 때만 검증: 최대 보증금 필수(양수) + 최소가 있으면 양수이고 최대 이하.
    // 전세자금대출 이용 여부는 여기서 막지 않고 review 단계에서 인라인으로 안내한다.
    validate: (form) => {
      if (form.dealType !== 'jeonse') return true
      const { jeonseDepositMax: max, jeonseDepositMin: min } = form
      if (max == null || max <= 0) return false
      if (min != null && (min <= 0 || min > max)) return false
      return true
    },
  },
]

// 카테고리별 단계 - 지금은 residential만 구현, office/retail은 자리만 예약
const categorySteps = {
  residential: [
    {
      id: 'room_type',
      component: RoomTypeStep,
      headlineKey: 'roomTypeHeadline',
      subKey: 'roomTypeSub',
      isApplicable: () => true,
      validate: (form) => form.roomTypes.length > 0,
    },
  ],
  office: [],
  retail: [],
}

// 모든 카테고리 공유 - 뒤쪽(입주조건/추가요청/확인)
const tailSteps = [
  {
    id: 'move_in',
    component: MoveInStep,
    headlineKey: 'moveInHeadline',
    subKey: 'moveInSub',
    isApplicable: () => true,
    validate: (form) => form.moveInDate.length > 0,
  },
  {
    id: 'extra',
    component: ExtraStep,
    headlineKey: 'extraHeadline',
    subKey: 'extraSub',
    isApplicable: () => true,
    validate: () => true, // 전부 선택 항목 - 빈 값으로도 다음 이동 가능
  },
  {
    id: 'review',
    component: ReviewStep,
    headlineKey: 'reviewHeadline',
    subKey: 'reviewSub',
    isApplicable: () => true,
    validate: () => true, // review 자체는 항상 통과 - 실제 제출 가능 여부는 orchestrator가 별도 판단
  },
]

// category만 바꿔 끼우면 최종 단계 목록이 달라지는 구조. office/retail을 열 때는
// categorySteps에 항목만 추가하면 되고, headSteps/tailSteps는 그대로 재사용된다.
// isApplicable은 지금은 전부 true(카테고리 선택 자체가 이미 배열 단위로 걸러주므로) -
// 같은 카테고리 안에서 deal_type 등에 따라 특정 단계 자체를 통째로 켜고 꺼야 할 상황이
// 생기면 이 필드를 실제로 활용한다.
export function getApplicableSteps(category) {
  const candidates = [...headSteps, ...(categorySteps[category] ?? []), ...tailSteps]
  return candidates.filter((step) => step.isApplicable({ category }))
}
