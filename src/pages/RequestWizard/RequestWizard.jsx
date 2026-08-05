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
import './RequestWizard.css'

export const PENDING_REQUEST_KEY = 'roomting_pending_request'
// draft TTL(DRAFT_TTL_MS)과 동일한 24시간 - pending도 "사용자의 미완료 의도" 데이터라 같은 정책을 쓴다.
export const PENDING_REQUEST_TTL_MS = 24 * 60 * 60 * 1000

// draft(작성 중 임시 저장)는 로그인 후 자동 제출용인 PENDING_REQUEST_KEY와
// 역할이 다르므로 완전히 별도 key를 쓴다.
export const REQUEST_DRAFT_KEY = 'roomting_request_draft'
const DRAFT_VERSION = 2
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const DRAFT_SAVE_DEBOUNCE_MS = 600

const DEFAULT_FORM = {
  station: '',
  dealType: 'rent',
  rent: 70,
  deposit: 1000,
  jeonseDepositMin: null,
  jeonseDepositMax: null,
  jeonseLoanPlanned: null,
  jeonseLoanDetail: '',
  roomTypes: [],
  jeonip: false,
  moveInDate: '',
  contractMonths: 6,
  amenities: [],
  extraNote: '',
}

// v1(단일 스크롤 폼) draft를 v2(단계형) 형태로 필드별 매핑한다. 필드 의미는 그대로라
// 값 손실 없이 이전 가능하고, 신규 필드(전세 관련 등)는 안전한 기본값으로 채운다.
// currentStep은 v1에 개념 자체가 없었으므로 0(1단계)으로 리셋한다 - 입력값은 보존하되
// 진행 위치만 처음부터 다시 훑게 한다(과도한 추론으로 위치를 되짚지 않는다).
function migrateV1ToV2(v1Draft) {
  return {
    form: {
      ...DEFAULT_FORM,
      station: v1Draft.station ?? '',
      rent: v1Draft.rent ?? 70,
      deposit: v1Draft.deposit ?? 1000,
      roomTypes: v1Draft.roomTypes ?? [],
      jeonip: v1Draft.jeonip ?? false,
      moveInDate: v1Draft.moveInDate ?? '',
      contractMonths: v1Draft.contractMonths ?? 6,
      amenities: v1Draft.amenities ?? [],
      extraNote: v1Draft.extraNote ?? '',
    },
    currentStep: 0,
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function loadValidDraft(maxStepIndex) {
  const raw = localStorage.getItem(REQUEST_DRAFT_KEY)
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    return null
  }
  if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.draft) {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    return null
  }
  if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    return null
  }
  if (parsed.version === DRAFT_VERSION) {
    return { form: parsed.draft, currentStep: clamp(parsed.currentStep ?? 0, 0, maxStepIndex) }
  }
  if (parsed.version === 1) {
    return migrateV1ToV2(parsed.draft)
  }
  localStorage.removeItem(REQUEST_DRAFT_KEY)
  return null
}

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

  const [draftPrompt, setDraftPrompt] = useState(null)
  const [autosaveEnabled, setAutosaveEnabled] = useState(false)
  const lastSavedDraftRef = useRef(null)

  useEffect(() => {
    const draft = loadValidDraft(applicableSteps.length - 1)
    if (draft) {
      setDraftPrompt(draft)
    } else {
      setAutosaveEnabled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleResumeDraft() {
    const { form: draftForm, currentStep } = draftPrompt
    setForm(draftForm)
    setCurrentStepIndex(currentStep)
    lastSavedDraftRef.current = JSON.stringify({ form: draftForm, currentStep })
    setDraftPrompt(null)
    setAutosaveEnabled(true)
  }

  function handleDiscardDraft() {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    setDraftPrompt(null)
    setAutosaveEnabled(true)
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
        localStorage.removeItem(REQUEST_DRAFT_KEY)
        lastSavedDraftRef.current = serialized
        return
      }
      localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        draft: form,
        currentStep: currentStepIndex,
      }))
      lastSavedDraftRef.current = serialized
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [autosaveEnabled, form, currentStepIndex])

  function update(patch) {
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
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    navigate(`/request/success/${created.id}`, { replace: true })
  }

  const StepComponent = currentDef.component

  return (
    <div className="frame">
      {draftPrompt && (
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
