import { isValidLocalISODate, isPastLocalDate } from '../../shared/format/moveInDate'
import { checkJeonseAmounts, checkJeonseLoanPlan } from './validateTransaction'
import { extraNoteOverBy } from './validateExtraNote'
import { TRANSACTION_ISSUE_MESSAGE_KEY } from './translations'

// 제출 직전 마지막 방어선. buildRequestPayload()는 순수 정규화 함수로 유지하고(예외를
// 던지지 않는다), 검증은 이 함수에서만 수행해 handleSubmit()에서 buildRequestPayload()
// 호출 전에 실행한다. 통과하면 null, 실패하면 화면에 그대로 보여줄 번역된 에러 문자열을 반환한다.
//
// move_in 단계의 validate()도 동일한 3단계(존재 → 형식 → 과거 여부)를 검사하지만 그건
// "다음" 버튼을 막을 뿐 이유를 설명하지 않는다. 여기서는 draft 재개처럼 단계 validate()를
// 다시 거치지 않고 review까지 우회한 경우까지 잡아내는 게 목적이라 에러 문구를 반환한다.
export function validateRequest(form, t) {
  // 역 선택은 자동완성 목록을 거쳐야만 성립한다. location 단계 validate() 가 이미 막지만,
  // 그건 "다음" 버튼만 막을 뿐이다. 여기서 다시 보는 이유는 단계 validate() 를 거치지 않고
  // review 까지 도달하는 경로 때문이다 - 구버전 draft 재개(stationId 가 아예 없다), 복원본
  // 진입, 단계 점프. 그 경로로 들어온 요청서는 station_id 없이 저장되고 029 라우팅에서
  // 조용히 탈락한다.
  if (!form.station || !form.station.trim()) return t.stationRequiredError
  if (form.stationId == null) return t.stationRequiredError

  if (!form.moveInDate) return t.moveInRequiredError
  if (!isValidLocalISODate(form.moveInDate)) return t.moveInRequiredError
  if (isPastLocalDate(form.moveInDate)) return t.moveInPastDateError

  // 전세 조건 최종 확인. 규칙 자체는 transaction 단계 validate()와 같은 함수를 쓰므로
  // 여기서 조건을 다시 하드코딩하지 않는다(validateTransaction.js가 단일 정의 지점).
  //
  // 금액과 대출 여부를 둘 다 보는 곳은 여기뿐이다. transaction 단계는 금액만 막고 대출
  // 여부는 통과시키는데, 그 상태로 review까지 온 뒤 제출을 누르는 경로가 정상 흐름이기 때문이다.
  //
  // DEPOSIT_MAX_MISSING도 여기서는 문구를 반환한다 - 화면 입력 중에는 빈 폼에 에러를 띄우지
  // 않지만(TransactionStep 참고), 제출 시점까지 비어 있다면 이유 없이 막히면 안 된다.
  const transactionIssue = checkJeonseAmounts(form) ?? checkJeonseLoanPlan(form)
  if (transactionIssue) return t[TRANSACTION_ISSUE_MESSAGE_KEY[transactionIssue]]

  // extra_note 길이. extra 단계 validate()가 이미 "다음"을 막지만, station 검사와 같은
  // 이유로 여기서 다시 본다 - 단계 validate()를 거치지 않고 review 까지 도달하는 경로가
  // 있다(복원본 진입, 이 제한 배포 이전 draft 재개, 단계 점프).
  //
  // ★ 이 게이트가 없으면 migration_032 적용 후 requests_extra_note_length CHECK 가
  //   그대로 올라온다. classifySubmitFailure()의 editable 화이트리스트에 아직 그 이름이
  //   없어 unknown 으로 분류되고, 사용자는 원인을 모른 채 "재시도"만 반복하게 된다.
  //   (화이트리스트 등록은 032 적용 후 message 원문 실측이 선행 조건 - 해당 파일 주석 참고)
  const extraNoteOver = extraNoteOverBy(form.extraNote)
  if (extraNoteOver > 0) return t.extraNoteOverLimitError(extraNoteOver)

  return null
}
