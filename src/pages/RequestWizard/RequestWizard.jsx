import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { getSession } from '../../api/auth.api'
import { createRequest } from '../../api/requests.api'
import { requestText } from './translations'
import { getApplicableSteps } from './steps'
import { buildRequestPayload } from './buildRequestPayload'
import { validateRequest } from './validateRequest'
import { checkJeonseLoanPlan } from './validateTransaction'
import { DEFAULT_FORM } from './formDefaults'
import {
  loadValidDraft,
  saveDraft,
  clearDraft,
  loadRestoredDraft,
  clearRestored,
  promoteRestoredToDraft,
} from './requestDraftStorage'
import './RequestWizard.css'

export const PENDING_REQUEST_KEY = 'roomting_pending_request'
// draft TTL(DRAFT_TTL_MS)과 동일한 24시간 - pending도 "사용자의 미완료 의도" 데이터라 같은 정책을 쓴다.
export const PENDING_REQUEST_TTL_MS = 24 * 60 * 60 * 1000

const DRAFT_SAVE_DEBOUNCE_MS = 600

// draft를 저장할 만한 입력이 있는지 판단하는 단일 기준점.
// draft를 저장하는 모든 경로는 이 함수를 거쳐야 한다 - 저장 조건을 다른 곳에 중복 구현하지 않는다.
function hasMeaningfulDraft(form) {
  return form.station.trim().length > 0
}

export default function RequestWizard() {
  const { lang } = useLanguage()
  const navigate = useNavigate()

  // 마법사 진행 중 전역 언어가 바뀌어도 단계 텍스트가 어긋나지 않도록 진입 시점 언어를 고정한다
  // (Onboarding에서 이미 검증한 lockedLang 패턴 재사용).
  const [lockedLang] = useState(() => lang)
  const t = requestText[lockedLang]

  // 지금은 residential만 구현 - office/retail이 열리면 이 값을 선택 가능하게 만들면 된다.
  const applicableSteps = getApplicableSteps('residential')
  const reviewIndex = applicableSteps.findIndex((s) => s.id === 'review')

  const [form, setForm] = useState(DEFAULT_FORM)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  // review에서 "수정"으로 진입한 경우 true - 다음 버튼이 "확인으로 돌아가기"로 바뀌고
  // 클릭 시 index+1이 아니라 review로 직접 점프한다. 사용자 입력이 아니라 순수 UI 상태라 draft에는 저장하지 않는다.
  const [returnToReview, setReturnToReview] = useState(false)

  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // { kind: 'resume', draft } - 기존 draft 이어쓰기 여부 확인(기존 동작)
  // { kind: 'conflict', draft, restored } - 복원본과 기존 draft가 둘 다 있고 기존 쪽이 더 최신
  const [draftPrompt, setDraftPrompt] = useState(null)
  const [autosaveEnabled, setAutosaveEnabled] = useState(false)
  // 전세로 제출됐던 요청서를 복원해서 월세 값이 기본값으로 채워진 상태. 사용자가 거래유형을
  // 바꾸는 순간에만 금액 재확인 안내를 띄우기 위한 플래그다.
  const [rentFallbackActive, setRentFallbackActive] = useState(false)
  const [showRentRecheckNotice, setShowRentRecheckNotice] = useState(false)
  const lastSavedDraftRef = useRef(null)

  // 화면 상태를 특정 draft로 채운다. autosave가 곧바로 같은 내용을 다시 쓰지 않도록
  // lastSavedDraftRef까지 맞춰준다.
  function applyEntry(entry) {
    setForm(entry.form)
    setCurrentStepIndex(entry.currentStep)
    lastSavedDraftRef.current = JSON.stringify({ form: entry.form, currentStep: entry.currentStep })
    setDraftPrompt(null)
    setAutosaveEnabled(true)
  }

  // 복원본을 채택한다. 저장(promote) 실패해도 화면에는 복원본을 띄운다 - 임시 키가 남아 있어
  // 다음 진입 때 다시 시도할 수 있고, 사용자가 지금 작업을 못 하게 막을 이유는 없다.
  function adoptRestored(restored) {
    promoteRestoredToDraft(restored)
    setRentFallbackActive(restored.rentFallbackApplied)
    applyEntry(restored)
  }

  useEffect(() => {
    const maxStepIndex = applicableSteps.length - 1
    const restored = loadRestoredDraft(maxStepIndex)
    const draft = loadValidDraft(maxStepIndex)

    // 복원본이 없으면 기존 동작 그대로.
    if (!restored) {
      if (draft) setDraftPrompt({ kind: 'resume', draft })
      else setAutosaveEnabled(true)
      return
    }

    // 덮어쓸 기존 draft가 아예 없으면 물어볼 것이 없다.
    if (!draft) {
      adoptRestored(restored)
      return
    }

    // 어느 쪽이 사용자의 최신 의도인지 판단한다.
    // 비교 대상은 "제출 버튼을 누른 시각"(sourceSavedAt)과 "마지막으로 타이핑한 시각"(draft.savedAt)이다.
    // 복원본이 만들어진 시각(restored.savedAt)으로 비교하면 방금 만든 복원본이 언제나 최신이라
    // 기존 draft를 항상 덮어쓰게 된다.
    // sourceSavedAt이 없는 복원본(구버전 등)은 판단 근거가 없으므로 덮어쓰지 않고 물어본다.
    const draftIsNewer = restored.sourceSavedAt == null || draft.savedAt > restored.sourceSavedAt
    if (draftIsNewer) {
      setDraftPrompt({ kind: 'conflict', draft, restored })
      return
    }

    adoptRestored(restored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleResumeDraft() {
    applyEntry(draftPrompt.draft)
  }

  function handleDiscardDraft() {
    clearDraft()
    setDraftPrompt(null)
    setAutosaveEnabled(true)
  }

  // 충돌 프롬프트의 두 버튼은 모두 "선택"이다. 어느 쪽도 사용자가 고르기 전에 지우지 않는다.
  function handleConflictUseRestored() {
    adoptRestored(draftPrompt.restored)
  }

  function handleConflictKeepDraft() {
    // 사용자가 명시적으로 기존 작성분을 택했으므로 복원본은 여기서 정리한다.
    clearRestored()
    applyEntry(draftPrompt.draft)
  }

  // whitelist: 조건 필드(form)와 currentStep만 저장 대상. error/loading 등 UI 상태나
  // returnToReview 같은 일시적 네비게이션 플래그는 절대 포함하지 않는다.
  useEffect(() => {
    if (!autosaveEnabled) return

    const current = { form, currentStep: currentStepIndex }
    const serialized = JSON.stringify(current)
    if (serialized === lastSavedDraftRef.current) return

    const timer = setTimeout(() => {
      if (!hasMeaningfulDraft(form)) {
        clearDraft()
        lastSavedDraftRef.current = serialized
        return
      }
      saveDraft(form, currentStepIndex)
      lastSavedDraftRef.current = serialized
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [autosaveEnabled, form, currentStepIndex])

  function update(patch) {
    // 전세로 제출됐던 요청서를 복원한 경우 월세 값은 원본이 없어 기본값이 들어가 있다.
    // 사용자가 거래유형을 실제로 바꾸는 순간(= 그 기본값이 화면에 나타나는 순간)에만
    // 금액을 다시 확인하라고 알린다. 값을 대신 고쳐주지는 않는다.
    if (rentFallbackActive && 'dealType' in patch && patch.dealType !== form.dealType) {
      setShowRentRecheckNotice(true)
      setRentFallbackActive(false)
    }
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const currentDef = applicableSteps[currentStepIndex]
  const isReviewStep = currentStepIndex === reviewIndex
  const canAdvance = currentDef.validate(form)
  const submitBlocked = checkJeonseLoanPlan(form) !== null
  const progressPct = Math.round(((currentStepIndex + 1) / applicableSteps.length) * 100)

  function handleBack() {
    if (currentStepIndex === 0) {
      navigate('/')
      return
    }
    setCurrentStepIndex((i) => i - 1)
  }

  function handleNext() {
    if (!canAdvance) return
    if (returnToReview) {
      setReturnToReview(false)
      setCurrentStepIndex(reviewIndex)
      return
    }
    setCurrentStepIndex((i) => i + 1)
  }

  function handleEditStep(stepId) {
    const idx = applicableSteps.findIndex((s) => s.id === stepId)
    if (idx === -1) return
    setReturnToReview(true)
    setCurrentStepIndex(idx)
  }

  async function handleSubmit() {
    if (submitBlocked) return
    setError(null)

    const validationError = validateRequest(form, t)
    if (validationError) { setError(validationError); return }

    const payload = buildRequestPayload(form)

    setLoading(true)
    const session = await getSession()
    if (!session) {
      // 로그인 안 된 상태 - 입력한 내용을 저장해두고 로그인 화면으로 이동
      // (기존 회원은 그대로 로그인, 신규 회원은 화면 내 "회원가입" 링크로 이동)
      // (로그인/가입 완료 직후 SignUp 화면에서 이 내용을 그대로 이어서 제출함)
      // replace: 완료 화면에서 뒤로가기를 눌러도 이 작성 화면이 다시 나타나지 않도록 함
      localStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify({ savedAt: Date.now(), payload }))
      navigate('/login/customer', { replace: true })
      return
    }

    const { data: created, error: submitError } = await createRequest(payload)
    setLoading(false)
    if (submitError) { setError(submitError); return }
    clearDraft()
    navigate(`/request/success/${created.id}`, { replace: true })
  }

  const StepComponent = currentDef.component

  return (
    <div className="frame">
      {draftPrompt?.kind === 'resume' && (
        <div className="draft-resume-overlay">
          <div className="draft-resume-card">
            <div className="draft-resume-title">{t.draftPromptTitle}</div>
            <div className="draft-resume-actions">
              <button className="rt-btn-secondary" onClick={handleDiscardDraft}>{t.draftPromptDiscard}</button>
              <button className="rt-btn-primary" onClick={handleResumeDraft}>{t.draftPromptResume}</button>
            </div>
          </div>
        </div>
      )}

      {/* 제출하려던 요청서와 작성 중이던 내용이 둘 다 있는 경우. 두 버튼 모두 "선택"이며
          어느 쪽도 사용자가 고르기 전에는 지우지 않는다. 하나를 고르면 다른 쪽은 사라지므로
          그 사실을 안내 문구로 분명히 밝힌다. */}
      {draftPrompt?.kind === 'conflict' && (
        <div className="draft-resume-overlay">
          <div className="draft-resume-card">
            <div className="draft-resume-title">{t.draftConflictTitle}</div>
            <div className="draft-conflict-desc">{t.draftConflictDesc}</div>
            <div className="draft-resume-actions">
              <button className="rt-btn-secondary" onClick={handleConflictUseRestored}>
                {t.draftConflictUseRestored}
              </button>
              <button className="rt-btn-primary" onClick={handleConflictKeepDraft}>
                {t.draftConflictKeepDraft}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="top-bar">
        <button type="button" className="back-btn" onClick={handleBack} aria-label="back">←</button>
        <div className="top-title">{t.topTitle}</div>
      </div>

      <div className="progress-wrap">
        <div className="progress-label">
          <span>{t.stepLabel(currentStepIndex + 1, applicableSteps.length)}</span>
          <span style={{ color: 'var(--coral)', fontWeight: 800 }}>{progressPct}%</span>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}></div></div>
      </div>

      <div className="form-body">
        <h1 className="wizard-headline">{t[currentDef.headlineKey]}</h1>
        <p className="wizard-sub">{t[currentDef.subKey]}</p>

        <StepComponent t={t} lang={lockedLang} form={form} update={update} onEditStep={handleEditStep} />

        {showRentRecheckNotice && <div className="rt-notice-text">{t.rentRecheckNotice}</div>}
        {error && <div className="rt-error-text">{error}</div>}
      </div>

      <div className="bottom-cta">
        {isReviewStep ? (
          <button className="rt-btn-primary" disabled={loading || submitBlocked} onClick={handleSubmit}>
            {t.submitLabel}
          </button>
        ) : (
          <button className="rt-btn-primary" disabled={!canAdvance} onClick={handleNext}>
            {returnToReview ? t.backToReviewLabel : t.nextLabel}
          </button>
        )}
      </div>
    </div>
  )
}
