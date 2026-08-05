import { DEFAULT_FORM } from './formDefaults'

// 마법사 draft의 localStorage 입출력을 담당하는 단일 지점.
//
// 이 모듈이 따로 있는 이유: 로그인 실패 복구 흐름에서 SignUp 화면도 draft를 써야 하는데,
// 저장 포맷(version/savedAt/draft/currentStep)을 SignUp이 직접 알게 되면 같은 포맷 지식이
// 두 파일에 생긴다. 포맷을 아는 곳을 여기 하나로 묶고, 바깥에는 의미 단위 함수만 노출한다.

export const REQUEST_DRAFT_KEY = 'roomting_request_draft'

// 제출에 실패한 요청서를 마법사로 되돌릴 때 거쳐가는 임시 키.
//
// REQUEST_DRAFT_KEY에 곧바로 쓰지 않는 이유: 그 순간 기존 draft가 사라져서 "둘 중 무엇을
// 살릴지" 물어볼 기회 자체가 없어진다. 복원본을 일단 별도 칸에 두고, 마법사가 양쪽을 모두
// 읽어 판단한 뒤에 옮긴다.
export const RESTORED_REQUEST_KEY = 'roomting_request_restored'

const DRAFT_VERSION = 2
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// localStorage 쓰기는 조용히 실패할 수 있다(용량 초과, 일부 브라우저의 프라이빗 모드).
// setItem이 예외를 던지지 않고도 값이 남지 않는 경우가 있어 되읽어서 확인한다.
// 이 함수의 반환값은 "원본을 지워도 안전한가"를 판단하는 근거로 쓰이므로 낙관적으로 true를
// 돌려주면 안 된다.
function writeVerified(key, serialized) {
  try {
    localStorage.setItem(key, serialized)
    return localStorage.getItem(key) === serialized
  } catch {
    return false
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 삭제 실패는 흐름을 막을 이유가 없다 - 남은 값은 TTL이 정리한다.
  }
}

// v1(단일 스크롤 폼) draft를 v2(단계형) 형태로 필드별 매핑한다. 필드 의미는 그대로라
// 값 손실 없이 이전 가능하고, 신규 필드(전세 관련 등)는 안전한 기본값으로 채운다.
// currentStep은 v1에 개념 자체가 없었으므로 0(1단계)으로 리셋한다 - 입력값은 보존하되
// 진행 위치만 처음부터 다시 훑게 한다(과도한 추론으로 위치를 되짚지 않는다).
function migrateV1ToV2(v1Draft, savedAt) {
  return {
    form: {
      ...DEFAULT_FORM,
      station: v1Draft.station ?? '',
      rent: v1Draft.rent ?? DEFAULT_FORM.rent,
      deposit: v1Draft.deposit ?? DEFAULT_FORM.deposit,
      roomTypes: v1Draft.roomTypes ?? [],
      jeonip: v1Draft.jeonip ?? false,
      moveInDate: v1Draft.moveInDate ?? '',
      contractMonths: v1Draft.contractMonths ?? DEFAULT_FORM.contractMonths,
      amenities: v1Draft.amenities ?? [],
      extraNote: v1Draft.extraNote ?? '',
    },
    currentStep: 0,
    savedAt,
  }
}

// 공통 파싱. 유효하지 않으면 해당 키를 정리하고 null.
// 반환에 savedAt을 포함하는 이유: 복원본과 기존 draft 중 어느 쪽이 사용자의 최신 의도인지
// 판단하려면 호출부가 저장 시각을 볼 수 있어야 한다.
function readEntry(key, maxStepIndex) {
  let raw
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    safeRemove(key)
    return null
  }

  if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.draft) {
    safeRemove(key)
    return null
  }
  if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
    safeRemove(key)
    return null
  }

  if (parsed.version === DRAFT_VERSION) {
    return {
      form: parsed.draft,
      currentStep: clamp(parsed.currentStep ?? 0, 0, maxStepIndex),
      savedAt: parsed.savedAt,
      // 복원본에만 있는 필드들(일반 draft에는 없어서 undefined로 남는다)
      sourceSavedAt: typeof parsed.sourceSavedAt === 'number' ? parsed.sourceSavedAt : null,
      rentFallbackApplied: parsed.rentFallbackApplied === true,
    }
  }
  if (parsed.version === 1) {
    return { ...migrateV1ToV2(parsed.draft, parsed.savedAt), sourceSavedAt: null, rentFallbackApplied: false }
  }

  safeRemove(key)
  return null
}

export function loadValidDraft(maxStepIndex) {
  return readEntry(REQUEST_DRAFT_KEY, maxStepIndex)
}

export function saveDraft(form, currentStep) {
  return writeVerified(
    REQUEST_DRAFT_KEY,
    JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), draft: form, currentStep }),
  )
}

export function clearDraft() {
  safeRemove(REQUEST_DRAFT_KEY)
}

// 제출 실패한 요청서를 복원본으로 저장한다. 성공 여부를 반드시 확인해서 반환한다 -
// 호출부(SignUp)가 이 값이 true일 때만 PENDING_REQUEST_KEY를 지우기 때문이다.
//
// sourceSavedAt: 원래 pending 래퍼의 savedAt, 즉 "사용자가 제출 버튼을 누른 시각".
// 충돌 판정의 기준이 되므로 저장 시각(savedAt)과 별도로 보존한다. 이걸 Date.now()로
// 대신하면 복원본이 언제나 최신이 되어 기존 draft를 항상 덮어쓰게 된다.
export function saveRestoredDraft({ form, currentStep, sourceSavedAt, rentFallbackApplied }) {
  return writeVerified(
    RESTORED_REQUEST_KEY,
    JSON.stringify({
      version: DRAFT_VERSION,
      savedAt: Date.now(),
      sourceSavedAt,
      draft: form,
      currentStep,
      rentFallbackApplied: rentFallbackApplied === true,
    }),
  )
}

export function loadRestoredDraft(maxStepIndex) {
  return readEntry(RESTORED_REQUEST_KEY, maxStepIndex)
}

export function clearRestored() {
  safeRemove(RESTORED_REQUEST_KEY)
}

// 복원본을 정식 draft 자리로 옮긴다. 쓰기 성공을 확인한 뒤에만 임시 키를 지운다 -
// 순서가 뒤바뀌면 쓰기가 실패했을 때 양쪽 모두 사라진다.
// 실패하면 임시 키를 남긴 채 false를 돌려주고, 호출부는 화면 상태만 복원본으로 채운다
// (다음 진입 때 다시 시도할 수 있다).
export function promoteRestoredToDraft(restored) {
  const ok = saveDraft(restored.form, restored.currentStep)
  if (ok) clearRestored()
  return ok
}
