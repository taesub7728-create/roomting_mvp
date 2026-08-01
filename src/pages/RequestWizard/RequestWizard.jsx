import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { WashingMachine, Snowflake, SquareParking, PawPrint, Flame } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { getSession } from '../../api/auth.api'
import { createRequest } from '../../api/requests.api'
import { requestText } from './translations'
import './RequestWizard.css'

export const PENDING_REQUEST_KEY = 'roomting_pending_request'

// draft(작성 중 임시 저장)는 로그인 후 자동 제출용인 PENDING_REQUEST_KEY와
// 역할이 다르므로 완전히 별도 key를 쓴다.
export const REQUEST_DRAFT_KEY = 'roomting_request_draft'
const DRAFT_VERSION = 1
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const DRAFT_SAVE_DEBOUNCE_MS = 600

// 폼 필드가 나중에 바뀌어도 오래된 draft로 폼이 깨지지 않도록 버전이 다르면 복원하지 않고 삭제한다.
function loadValidDraft() {
  const raw = localStorage.getItem(REQUEST_DRAFT_KEY)
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    return null
  }
  if (!parsed || parsed.version !== DRAFT_VERSION || !parsed.draft || typeof parsed.savedAt !== 'number') {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    return null
  }
  if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    return null
  }
  return parsed.draft
}

// draft를 저장할 만한 입력이 있는지 판단하는 단일 기준점.
// draft를 저장하는 모든 경로는 이 함수를 거쳐야 한다 - 저장 조건을 다른 곳에 중복 구현하지 않는다.
// 향후 필수 입력 항목이 바뀌면 이 함수만 수정하면 된다.
function hasMeaningfulDraft(draft) {
  return draft.station.trim().length > 0
}

const AMENITY_ICONS = {
  washer: WashingMachine,
  ac: Snowflake,
  parking: SquareParking,
  pet: PawPrint,
  full_option: Flame,
}

export default function RequestWizard() {
  const { lang } = useLanguage()
  const t = requestText[lang]
  const navigate = useNavigate()

  const [station, setStation] = useState('')
  const [rent, setRent] = useState(70)
  const [deposit, setDeposit] = useState(1000)
  const [roomTypes, setRoomTypes] = useState([])
  const [jeonip, setJeonip] = useState(false)
  const [moveInDate, setMoveInDate] = useState('')
  const [contractMonths, setContractMonths] = useState(6)
  const [amenities, setAmenities] = useState([])
  const [extraNote, setExtraNote] = useState('')

  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // 복원 여부를 물어보는 draft(있을 경우)와, 그 확인이 끝나기 전까지는 autosave를 켜지 않기 위한 플래그
  const [draftPrompt, setDraftPrompt] = useState(null)
  const [autosaveEnabled, setAutosaveEnabled] = useState(false)
  const lastSavedDraftRef = useRef(null)

  // 마운트 시 1회만 유효한 draft 확인. 없으면 바로 autosave 시작, 있으면 사용자 선택을 기다린다.
  useEffect(() => {
    const draft = loadValidDraft()
    if (draft) {
      setDraftPrompt(draft)
    } else {
      setAutosaveEnabled(true)
    }
  }, [])

  function handleResumeDraft() {
    const d = draftPrompt
    setStation(d.station ?? '')
    setRent(d.rent ?? 70)
    setDeposit(d.deposit ?? 1000)
    setRoomTypes(d.roomTypes ?? [])
    setJeonip(d.jeonip ?? false)
    setMoveInDate(d.moveInDate ?? '')
    setContractMonths(d.contractMonths ?? 6)
    setAmenities(d.amenities ?? [])
    setExtraNote(d.extraNote ?? '')
    lastSavedDraftRef.current = JSON.stringify(d)
    setDraftPrompt(null)
    setAutosaveEnabled(true)
  }

  function handleDiscardDraft() {
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    setDraftPrompt(null)
    setAutosaveEnabled(true)
  }

  // whitelist: 조건 필드만 저장 대상. error/loading 등 UI 상태나 개인정보 필드는 절대 포함하지 않는다.
  useEffect(() => {
    if (!autosaveEnabled) return

    const current = { station, rent, deposit, roomTypes, jeonip, moveInDate, contractMonths, amenities, extraNote }
    const serialized = JSON.stringify(current)
    if (serialized === lastSavedDraftRef.current) return

    const timer = setTimeout(() => {
      if (!hasMeaningfulDraft(current)) {
        localStorage.removeItem(REQUEST_DRAFT_KEY)
        lastSavedDraftRef.current = serialized
        return
      }
      localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        draft: current,
      }))
      lastSavedDraftRef.current = serialized
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [autosaveEnabled, station, rent, deposit, roomTypes, jeonip, moveInDate, contractMonths, amenities, extraNote])

  function toggleRoomType(code) {
    setRoomTypes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }
  function toggleAmenity(label) {
    setAmenities((prev) => (prev.includes(label) ? prev.filter((a) => a !== label) : [...prev, label]))
  }

  // 프로토타입과 동일한 방식: 필수 입력 3개(지역, 입주일, 방타입) + 예산/계약기간은 항상 값이 있으니 기본 반영
  const filledCount = [station.trim().length > 0, moveInDate.length > 0, roomTypes.length > 0].filter(Boolean).length + 2
  const progressPct = Math.round((filledCount / 5) * 100)

  async function handleSubmit() {
    setError(null)
    if (!station.trim() || !moveInDate) {
      setError(t.alertMsg)
      return
    }

    const payload = {
      regionText: station.trim(),
      rentMax: rent,
      depositMax: deposit,
      roomTypes,
      contractMonths,
      amenities,
      extraNote,
      moveInDate,
      registrationRequired: jeonip,
    }

    setLoading(true)
    const session = await getSession()
    if (!session) {
      // 로그인 안 된 상태 - 입력한 내용을 저장해두고 로그인 화면으로 이동
      // (기존 회원은 그대로 로그인, 신규 회원은 화면 내 "회원가입" 링크로 이동)
      // (로그인/가입 완료 직후 SignUp 화면에서 이 내용을 그대로 이어서 제출함)
      // replace: 완료 화면에서 뒤로가기를 눌러도 이 작성 화면이 다시 나타나지 않도록 함
      localStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(payload))
      navigate('/login/customer', { replace: true })
      return
    }

    const { data: created, error: submitError } = await createRequest(payload)
    setLoading(false)
    if (submitError) { setError(submitError); return }
    localStorage.removeItem(REQUEST_DRAFT_KEY)
    navigate(`/request/success/${created.id}`, { replace: true })
  }

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
        <Link className="back-btn" to="/">←</Link>
        <div className="top-title">{t.topTitle}</div>
      </div>

      <div className="progress-wrap">
        <div className="progress-label">
          <span>{t.progressLabel}</span>
          <span style={{ color: 'var(--coral)', fontWeight: 800 }}>{progressPct}%</span>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}></div></div>
      </div>

      <div className="form-body">
        {/* 1. 지역/역 */}
        <div className="rw-section">
          <div className="rw-section-header">
            <div className="rw-section-title">{t.s1title}</div>
            <span className="rw-required">*</span>
          </div>
          <input
            className="rw-input"
            type="text"
            placeholder={t.stationPlaceholder}
            value={station}
            onChange={(e) => setStation(e.target.value)}
          />
          <div className="chip-group">
            {t.stationChips.map((name) => (
              <div
                key={name}
                className={`chip${station === name ? ' active' : ''}`}
                onClick={() => setStation(name)}
              >
                {name}
              </div>
            ))}
          </div>
        </div>

        {/* 2. 예산 */}
        <div className="rw-section">
          <div className="rw-section-header"><div className="rw-section-title">{t.s2title}</div></div>

          <div className="slider-card">
            <div className="rw-section-sub" style={{ marginBottom: 10 }}>{t.rentLabel}</div>
            <div className="slider-display">
              <span className="slider-value">{rent}</span>
              <span className="slider-unit">{t.rentUnit}</span>
            </div>
            <input className="rw-range" type="range" min={20} max={300} step={10} value={rent} onChange={(e) => setRent(Number(e.target.value))} />
            <div className="range-labels"><span>{t.rentRangeLabels[0]}</span><span>{t.rentRangeLabels[1]}</span></div>
          </div>

          <div className="slider-card">
            <div className="rw-section-sub" style={{ marginBottom: 10 }}>{t.depositLabel}</div>
            <div className="slider-display">
              <span className="slider-value">{deposit.toLocaleString()}</span>
              <span className="slider-unit">{t.depositUnit}</span>
            </div>
            <input className="rw-range" type="range" min={0} max={5000} step={100} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} />
            <div className="range-labels"><span>{t.depositRangeLabels[0]}</span><span>{t.depositRangeLabels[1]}</span></div>
          </div>
        </div>

        {/* 3. 방 타입 */}
        <div className="rw-section">
          <div className="rw-section-header"><div className="rw-section-title">{t.s3title}</div></div>
          <div className="chip-group">
            {t.roomTypes.map((rt) => (
              <div
                key={rt.code}
                className={`chip${roomTypes.includes(rt.code) ? ' active' : ''}`}
                onClick={() => toggleRoomType(rt.code)}
              >
                {rt.label}
              </div>
            ))}
          </div>
        </div>

        {/* 4. 전입신고 */}
        <div className="rw-section">
          <div className="rw-section-header"><div className="rw-section-title">{t.s4title}</div></div>
          <div className={`toggle-row${jeonip ? ' on' : ''}`} onClick={() => setJeonip((v) => !v)}>
            <div className="toggle-left">
              <div className="toggle-main">{t.jeonipMain}</div>
              <div className="toggle-desc">{t.jeonipDesc}</div>
            </div>
            <div className="rw-switch"></div>
          </div>
        </div>

        {/* 5. 입주 일정 */}
        <div className="rw-section">
          <div className="rw-section-header"><div className="rw-section-title">{t.s5title}</div></div>
          <div className="two-col">
            <div>
              <div className="rw-section-sub" style={{ marginBottom: 8 }}>{t.moveinLabel} <span style={{ color: 'var(--coral)' }}>*</span></div>
              <input
                className="date-input"
                type="date"
                value={moveInDate}
                onChange={(e) => setMoveInDate(e.target.value)}
              />
            </div>
            <div>
              <div className="rw-section-sub" style={{ marginBottom: 8 }}>{t.contractLabel}</div>
              <div className="slider-card" style={{ padding: '11px 13px' }}>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--coral)' }}>{contractMonths}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', marginLeft: 2 }}>{t.contractUnit}</span>
                </div>
                <input className="rw-range" type="range" min={1} max={24} step={1} value={contractMonths} onChange={(e) => setContractMonths(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        {/* 6. 추가 요청 */}
        <div className="rw-section">
          <div className="rw-section-header"><div className="rw-section-title">{t.s6title}</div></div>
          <div className="chip-group" style={{ marginBottom: 6 }}>
            {t.amenities.map((a) => {
              const Icon = AMENITY_ICONS[a.code]
              return (
                <div
                  key={a.code}
                  className={`chip${amenities.includes(a.code) ? ' active' : ''}`}
                  onClick={() => toggleAmenity(a.code)}
                >
                  <Icon size={13} strokeWidth={2} style={{ marginRight: 5, verticalAlign: -2 }} />
                  {a.label}
                </div>
              )
            })}
          </div>
          <textarea
            className="rw-textarea"
            placeholder={t.textareaPlaceholder}
            value={extraNote}
            onChange={(e) => setExtraNote(e.target.value)}
          />
        </div>

        {error && <div className="rt-error-text">{error}</div>}
      </div>

      <div className="bottom-cta">
        <button className="rt-btn-primary" disabled={loading} onClick={handleSubmit}>{t.submitLabel}</button>
      </div>
    </div>
  )
}
