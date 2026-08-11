// extra_note 길이 규칙의 단일 정의 지점.
//
// validateTransaction.js 와 같은 이유로 분리했다 - 이 규칙을 ExtraStep(입력칸 maxLength·
// 카운터) / steps.js(단계 validate) / validateRequest.js(제출 게이트) 세 곳이 쓰는데,
// 각자 300 을 하드코딩하면 한 곳만 고쳤을 때 조용히 어긋난다.
//
// ============================================================================
// DB 제약과의 관계
// ============================================================================
//   migration_032 가 걸 제약:
//     check (extra_note is null or char_length(extra_note) <= 300)  -- not valid
//
//   ★ 032 는 아직 적용되지 않았다. 이 프론트 제한이 먼저 배포돼야 하는 이유는
//     032:11-14 에 있다 - CHECK 는 NOT VALID 라서 기존 행만 건너뛰고 신규 INSERT 는
//     그대로 막는다. UI 가 먼저 길이를 제한해야 사용자가 입력 중에 알 수 있고,
//     순서를 뒤집으면 제출 시점에 이유 없이 거부당한다.
//
// ============================================================================
// ★ 글자 수 세는 방법이 DB 와 다르다 (의도된 차이)
// ============================================================================
//   Postgres char_length() 는 **코드포인트**를 세고,
//   JS String.length 와 HTML maxLength 는 **UTF-16 코드유닛**을 센다.
//   이모지처럼 BMP 밖 문자는 JS 에서 2 로 잡힌다.
//
//   따라서 항상  JS 카운트 >= DB 카운트  이고, 방향이 안전하다:
//     - DB 가 거부할 값을 UI 가 통과시키는 일은 **없다**
//     - 반대로 이모지가 많으면 DB 기준으로는 여유가 있는데 UI 가 먼저 막는다
//
//   코드포인트 기준([...value].length)으로 세면 DB 와 정확히 일치하지만, 그러면
//   카운터(코드포인트)와 입력칸 maxLength(코드유닛)가 서로 다른 값을 기준으로 삼아
//   "카운터는 280 인데 더 이상 입력이 안 되는" 상태가 생긴다. 사용자에게는 그쪽이
//   훨씬 혼란스럽다.
//
//   -> **카운터와 입력 제한이 같은 기준(String.length)을 쓰는 쪽을 택했다.**
//      프론트가 DB 보다 엄격한 것은 이 저장소의 기존 판단과 같은 방향이다
//      (TODO_PHASE2.md 40번 ★ - LocationStep 이 station 선택을 필수화한 근거).

export const EXTRA_NOTE_MAX_LENGTH = 300

/** 화면 카운터와 제출 게이트가 함께 쓰는 길이. 입력칸 maxLength 와 같은 기준이다. */
export function extraNoteLength(value) {
  return typeof value === 'string' ? value.length : 0
}

/**
 * 제한 초과분. 0 이면 정상이다.
 *
 * ★ 사용자가 직접 타이핑해서 이 값이 0 보다 커질 수는 없다(maxLength 가 막는다).
 *   0 보다 커지는 경로는 **state 로 값이 주입되는 경우** 하나뿐이다:
 *     - restoreRequestForm() 이 되살린 복원본
 *     - 이 제한이 배포되기 전에 저장된 draft 재개
 *   maxLength 는 사용자 입력만 막고 이미 들어 있는 값을 자르지 않는다.
 *
 * ★ 그 값을 조용히 잘라내지 않는다. Phase 3 가 restoreRequestForm 에서 세운 원칙과
 *   같다 - 잘못된 값을 고쳐서 복원하면 사용자는 무엇이 잘못됐는지 영영 모른다.
 *   대신 초과 상태를 보여주고 제출을 막아 사용자가 직접 지우게 한다.
 */
export function extraNoteOverBy(value) {
  return Math.max(0, extraNoteLength(value) - EXTRA_NOTE_MAX_LENGTH)
}

/** form 단위 판정. steps.js 의 단계 validate 와 validateRequest() 가 함께 쓴다. */
export function isExtraNoteWithinLimit(form) {
  return extraNoteOverBy(form?.extraNote) === 0
}
