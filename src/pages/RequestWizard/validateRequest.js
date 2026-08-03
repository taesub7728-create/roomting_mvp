import { isValidLocalISODate, isPastLocalDate } from '../../shared/format/moveInDate'

// 제출 직전 마지막 방어선. buildRequestPayload()는 순수 정규화 함수로 유지하고(예외를
// 던지지 않는다), 검증은 이 함수에서만 수행해 handleSubmit()에서 buildRequestPayload()
// 호출 전에 실행한다. 통과하면 null, 실패하면 화면에 그대로 보여줄 번역된 에러 문자열을 반환한다.
//
// move_in 단계의 validate()도 동일한 3단계(존재 → 형식 → 과거 여부)를 검사하지만 그건
// "다음" 버튼을 막을 뿐 이유를 설명하지 않는다. 여기서는 draft 재개처럼 단계 validate()를
// 다시 거치지 않고 review까지 우회한 경우까지 잡아내는 게 목적이라 에러 문구를 반환한다.
export function validateRequest(form, t) {
  if (!form.moveInDate) return t.moveInRequiredError
  if (!isValidLocalISODate(form.moveInDate)) return t.moveInRequiredError
  if (isPastLocalDate(form.moveInDate)) return t.moveInPastDateError

  return null
}
