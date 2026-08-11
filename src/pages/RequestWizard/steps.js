import LocationStep from './steps/LocationStep'
import TransactionStep from './steps/TransactionStep'
import RoomTypeStep from './steps/RoomTypeStep'
import MoveInStep from './steps/MoveInStep'
import ExtraStep from './steps/ExtraStep'
import ReviewStep from './steps/ReviewStep'
import { isValidLocalISODate, isPastLocalDate } from '../../shared/format/moveInDate'
import { checkJeonseAmounts } from './validateTransaction'
import { isExtraNoteWithinLimit } from './validateExtraNote'

// 모든 카테고리 공유 - 앞쪽(지역/거래조건)
const headSteps = [
  {
    id: 'location',
    component: LocationStep,
    headlineKey: 'locationHeadline',
    subKey: 'locationSub',
    isApplicable: () => true,
    // ★ 자동완성 목록에서 실제로 고른 경우에만 통과한다(2026-08-10).
    //   텍스트만 입력하면 검색은 되지만 다음 단계로 못 간다.
    //
    //   027 은 station_id 를 nullable 로 두지만 그건 legacy 호환과 rollout 안전을 위한
    //   것이고, 프론트가 더 엄격한 것은 모순이 아니다. station_id 없이 저장된 요청서는
    //   029 라우팅에서 에러가 아니라 조용히 탈락한다 - 발견이 가장 어려운 종류의 문제다.
    //   308역 전부 별칭이 있어(커버 308/308) "검색 안 되는 역" 때문에 막힐 일은 없다.
    validate: (form) => form.station.trim().length > 0 && form.stationId != null,
  },
  {
    id: 'transaction',
    component: TransactionStep,
    headlineKey: 'transactionHeadline',
    subKey: 'transactionSub',
    isApplicable: () => true,
    // 금액 규칙만 본다. 전세자금대출 이용 여부(checkJeonseLoanPlan)는 여기서 막지 않고
    // review 단계에서 인라인으로 안내한다 - validateTransaction.js의 함수 분할 주석 참고.
    validate: (form) => checkJeonseAmounts(form) === null,
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
    // 존재 -> 형식 -> 과거 여부 순서로 검사(validateRequest()와 동일한 순서, 여긴 이유
    // 설명 없이 "다음"만 막는다 - 이유 표시는 review 진입 전 최종 검증에서 담당).
    validate: (form) =>
      !!form.moveInDate &&
      isValidLocalISODate(form.moveInDate) &&
      !isPastLocalDate(form.moveInDate),
  },
  {
    id: 'extra',
    component: ExtraStep,
    headlineKey: 'extraHeadline',
    subKey: 'extraSub',
    isApplicable: () => true,
    // 전부 선택 항목이라 빈 값으로도 다음 이동 가능하다. 유일한 예외가 길이 초과다.
    //
    // ★ 전세 대출 여부(checkJeonseLoanPlan)를 transaction 단계에서 막지 않은 것과 반대로
    //   판단했다. 그쪽은 "사용자가 아직 답한 적 없는 빈 항목"이라 그 자리에서 막으면 이유를
    //   알 수 없어 review 로 미뤘다. 여기는 다르다 - 초과한 본문과 카운터가 바로 위에 보이고
    //   몇 자를 지워야 하는지도 화면에 있다. 통과시키면 textarea 가 없는 review 에서 막혀
    //   되돌아와야 한다.
    validate: (form) => isExtraNoteWithinLimit(form),
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

// step id -> 배열 인덱스. draft에는 진행 위치가 인덱스로 저장되는데, 그 인덱스는
// getApplicableSteps()의 배열 순서에 의존한다. 바깥에서 숫자를 직접 적으면 office/retail을
// 열어 단계 수가 달라지는 순간 조용히 다른 단계를 가리키게 되므로, 변환은 여기서만 한다.
//
// 모르는 id는 0(첫 단계)으로 떨어뜨린다. 복원 흐름에서 이 값이 쓰이는데, 잘못된 위치로
// 보내느니 처음부터 훑게 하는 편이 안전하다.
export function getStepIndex(category, stepId) {
  const index = getApplicableSteps(category).findIndex((step) => step.id === stepId)
  return index === -1 ? 0 : index
}
