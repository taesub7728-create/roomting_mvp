// requests INSERT 실패(주로 pending 자동 제출 경로)를 retryable/editable/unknown 3가지로
// 분류하는 순수 함수. UI/네트워크 호출과 완전히 분리해뒀다 - 입력은 supabase-js가 돌려주는
// 원본 에러 객체(가공 전) 하나, 출력은 문자열 하나뿐이라 별도 프레임워크 없이도 단위 테스트를
// 붙이기 쉬운 구조다(이 프로젝트엔 아직 테스트 프레임워크가 없어 실제로 테스트 파일은 만들지
// 않았다 - 도입 여부는 별도 판단 필요).
//
// 분류 근거(2026-08-04, 이 프로젝트 Supabase 인스턴스에서 실측):
//   - error.code: PostgREST가 Postgres SQLSTATE를 그대로 전달한다. CHECK 위반은 '23514'로
//     실측 확인됨.
//   - error.details / error.hint: 이번에 재현한 CHECK 위반 2건 모두 null이었다. 값이 항상
//     채워진다는 보장이 없으므로 분류 기준으로 쓰지 않는다.
//   - error.name: undefined로 관측됨(PostgrestError가 표준 Error를 상속하지 않는 것으로
//     보임) - instanceof 기반 판별은 쓰지 않는다.
//   - constraint 이름: error.message 문자열에 `violates check constraint "이름"` 형태로만
//     포함된다(실측 확인, 별도 필드 없음) - 정규식으로 추출한다.
//
// 깨지기 쉬운 지점: constraint 이름 추출이 error.message 문자열 형식에 의존한다. Postgres나
// PostgREST 버전이 바뀌어 메시지 문구가 달라지면 정규식이 조용히 매치 실패할 수 있다 - 그 경우
// editable로 잘못 분류하지 않고 반드시 unknown으로 떨어지도록 아래에서 구현했다(오분류로
// editable이 되면 사용자가 고칠 수 없는 것을 고치라고 안내하게 되므로, 실패 방향을 unknown
// 쪽으로 고정한다).
const EDITABLE_CONSTRAINTS = new Set([
  'requests_deposit_range_consistency',
  'requests_jeonse_loan_consistency',
])

// 브라우저 fetch 계층에서 나는 대표적인 네트워크 실패 메시지(Chrome/Firefox/Safari) +
// 명백한 타임아웃 문구만 인정한다. error.code가 없다는 이유만으로 retryable로 넘기지 않는다
// (코드 없는 애플리케이션 예외는 unknown).
const RETRYABLE_MESSAGE_PATTERNS = [/Failed to fetch/i, /NetworkError/i, /Load failed/i, /timeout/i]

export function classifySubmitFailure(error) {
  if (!error) return 'unknown'

  const message = typeof error.message === 'string' ? error.message : ''

  if (RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'retryable'
  }

  if (error.code === '23514') {
    const constraintMatch = message.match(/violates check constraint "([^"]+)"/)
    if (!constraintMatch) return 'unknown'
    return EDITABLE_CONSTRAINTS.has(constraintMatch[1]) ? 'editable' : 'unknown'
  }

  // RLS/권한 오류(예: 42501), constraint를 특정할 수 없는 CHECK, 코드 없는 예상 밖 예외,
  // 그 외 나머지 DB 오류는 전부 unknown.
  return 'unknown'
}
