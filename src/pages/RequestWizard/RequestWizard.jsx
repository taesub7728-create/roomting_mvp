import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { WashingMachine, Snowflake, SquareParking, PawPrint, Flame } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { getSession } from '../../api/auth.api'
import { createRequest } from '../../api/requests.api'
import logo from '../../assets/roomting-symbol.svg'
import { requestText } from './translations'
import './RequestWizard.css'

export const PENDING_REQUEST_KEY = 'roomting_pending_request'

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
  const [success, setSuccess] = useState(false)
  const [newRequestId, setNewRequestId] = useState(null)

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
      // 로그인 안 된 상태 - 입력한 내용을 저장해두고 회원가입 화면으로 이동
      // (가입 완료 직후 SignUp 화면에서 이 내용을 그대로 이어서 제출함)
      localStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(payload))
      navigate('/signup/customer')
      return
    }

    const { data: created, error: submitError } = await createRequest(payload)
    setLoading(false)
    if (submitError) { setError(submitError); return }
    setNewRequestId(created.id)
    setSuccess(true)
  }

  return (
    <div className="frame">
      <div className="top-bar">
        <Link className="back-btn" to="/">←</Link>
        <div className="top-title">{t.topTitle}</div>
      </div>

      <div className="progress-wrap">
        <div className="progress-label">
          <span>{t.progressLabel}</span>
          <span style={{ color: 'var(--pink)', fontWeight: 800 }}>{progressPct}%</span>
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
              <div className="rw-section-sub" style={{ marginBottom: 8 }}>{t.moveinLabel} <span style={{ color: 'var(--pink)' }}>*</span></div>
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
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--pink)' }}>{contractMonths}</span>
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

      {success && (
        <div className="success-overlay">
          <div className="success-icon-wrap"><img src={logo} alt="roomting" /></div>
          <div className="success-title">{t.successTitle}</div>
          <div className="success-desc">{t.successDesc}</div>
          <button className="rt-btn-secondary" onClick={() => navigate(newRequestId ? `/requests/${newRequestId}` : '/')}>{t.successClose}</button>
        </div>
      )}
    </div>
  )
}
