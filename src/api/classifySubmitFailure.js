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
//
// ★ 등록 대기: requests_extra_note_length (migration_032, 미적용)
//   032 가 걸 CHECK 는 extra_note 300자 제한이고, 사용자가 스스로 고칠 수 있는 값이므로
//   성격상 editable 이 맞다. 그런데 이 파일의 분류는 **실측으로만 확정한다**는 것이
//   2026-08-04 에 세운 원칙이다(위 "분류 근거" 참고). 032 가 아직 적용되지 않아
//   이 constraint 가 실제로 code '23514' 로 오는지, message 가 위 정규식과 같은 형태인지
//   확인된 바 없다.
//
//   지금 추가하지 않는다. 미확인 상태로 넣으면 "등록했으니 editable 로 분류된다"고
//   믿게 되는데, 실제로는 매치 실패로 unknown 에 떨어지면서 아무도 눈치채지 못한다.
//   등록하지 않은 지금은 unknown 폴백이 그대로 동작하며, 그것이 안전한 방향이다.
//
//   -> 032 적용 직후 위반을 1회 재현해 error.code / error.message 원문을 확인하고,
//      기존 2개와 같은 형태이면 아래 Set 에 이름 한 줄을 추가한다.
//      TODO_PHASE2.md 「032 적용 직후 실측 항목」 참고.
//
//   ※ 그때까지 사용자가 이 CHECK 에 걸리는 일은 없어야 한다 - RequestWizard 의
//     validateExtraNote.js 가 입력·단계·제출 3중으로 먼저 막는다. 이 화이트리스트는
//     그 게이트를 우회하는 경로(구버전 클라이언트가 만든 pending payload 재생 등)를
//     위한 2차 방어다.
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
