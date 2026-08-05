// 전세(jeonse) 거래조건 검증 규칙의 단일 정의 지점. 순수 함수만 두고 번역/UI는 다루지 않는다
// (호출부가 boolean으로 쓰든 문구로 바꾸든 자유롭게 쓰도록, 여기서는 코드만 반환한다).
//
// 이 규칙들은 DB CHECK 제약(requests_deposit_range_consistency,
// requests_jeonse_loan_consistency)과 의도적으로 동일하게 맞춘 것이다. 여기 검증은 어디까지나
// UX용이고 실제 방어는 DB가 담당한다 - 규칙을 고칠 일이 생기면 migration 쪽도 함께 봐야 한다.
//
// 금액 검증과 대출 여부 검증을 굳이 두 함수로 나눈 이유:
// 전세자금대출 이용 여부는 transaction 단계에서 "다음"을 막지 않고 review 단계에서만 막는다는
// 정책이 이미 확정돼 있다(TODO_PHASE2.md "거래 유형(전세) 관련" 참고 - 다른 단계는 자유롭게
// 넘어가는데 이 항목만 그 자리에서 막히면 혼란스럽다는 판단). 하나의 함수로 합치면 step
// validate가 대출 미입력까지 막아버려 그 정책이 깨지므로, 호출부가 필요한 조각만 고를 수 있게 나눈다.

// "미입력"과 "0 이하 입력"을 다른 코드로 구분한다. 아직 아무것도 입력하지 않은 빈 폼에
// 빨간 에러를 띄우면 안 되지만(MISSING), 사용자가 실제로 0을 타이핑한 것은 그 자리에서
// 알려줘야 하기 때문이다(NOT_POSITIVE). 두 경우를 하나로 합치면 호출부가 다시
// max == null 같은 조건을 각자 하드코딩하게 되므로 코드 단계에서 갈라둔다.
export const TRANSACTION_ISSUE = {
  DEPOSIT_MAX_MISSING: 'deposit_max_missing', // 최대 보증금 미입력(빈 값)
  DEPOSIT_MAX_NOT_POSITIVE: 'deposit_max_not_positive', // 최대 보증금을 0 이하로 입력
  DEPOSIT_MIN_NOT_POSITIVE: 'deposit_min_not_positive', // 최소 보증금을 0 이하로 입력
  DEPOSIT_RANGE_INVERTED: 'deposit_range_inverted', // 최소 > 최대
  LOAN_PLAN_REQUIRED: 'loan_plan_required', // 전세인데 대출 이용 여부 미선택
}

// 전세 보증금 금액 규칙만 검사한다. 월세면 검사할 것이 없으므로 항상 null.
// 위반이 여러 개여도 첫 번째 코드 하나만 반환한다(화면에 한 번에 하나씩만 보여주기 위함).
//
// 값의 형태: UI 경로는 parseAmountInput()이 "null 또는 0 이상 정수"만 만들고,
// restoreRequestForm() 복원 경로도 DB의 numeric 컬럼에서 오므로 동일하다.
export function checkJeonseAmounts(form) {
  if (form.dealType !== 'jeonse') return null

  const { jeonseDepositMax: max, jeonseDepositMin: min } = form

  if (max == null) return TRANSACTION_ISSUE.DEPOSIT_MAX_MISSING
  if (max <= 0) return TRANSACTION_ISSUE.DEPOSIT_MAX_NOT_POSITIVE
  if (min != null) {
    if (min <= 0) return TRANSACTION_ISSUE.DEPOSIT_MIN_NOT_POSITIVE
    if (min > max) return TRANSACTION_ISSUE.DEPOSIT_RANGE_INVERTED
  }

  return null
}

// 전세자금대출 이용 여부 선택 규칙만 검사한다. 월세면 항상 null.
// null(미선택)만 위반이고 false(이용 안 함)는 정상 선택이므로 == null로 판별한다.
export function checkJeonseLoanPlan(form) {
  if (form.dealType !== 'jeonse') return null

  return form.jeonseLoanPlanned == null ? TRANSACTION_ISSUE.LOAN_PLAN_REQUIRED : null
}
