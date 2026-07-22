import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { getRequestById, closeRequest } from '../../api/requests.api'
import { listPropertiesForRequest } from '../../api/properties.api'
import { getRoomTypeLabel } from '../../utils/roomTypeLabel'
import { responseText } from './translations'
import './ResponseStatus.css'

function splitRemaining(deadline) {
  const diffSec = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000))
  return {
    h: String(Math.floor(diffSec / 3600)).padStart(2, '0'),
    m: String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0'),
    s: String(diffSec % 60).padStart(2, '0'),
    expired: diffSec <= 0,
  }
}

export default function ResponseStatus() {
  const { requestId } = useParams()
  const { lang } = useLanguage()
  const t = responseText[lang]

  const [request, setRequest] = useState(null)
  const [properties, setProperties] = useState([])
  const [error, setError] = useState(null)
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: reqData, error: reqError } = await getRequestById(requestId)
      if (reqError) { setError(reqError); return }
      setRequest(reqData)

      const { data: propsData, error: propsError } = await listPropertiesForRequest(requestId)
      if (propsError) setError(propsError)
      else setProperties(propsData)
    }
    load()
  }, [requestId])

  useEffect(() => {
    if (!request?.response_deadline) return
    setRemaining(splitRemaining(request.response_deadline))
    const timer = setInterval(() => setRemaining(splitRemaining(request.response_deadline)), 1000)
    return () => clearInterval(timer)
  }, [request?.response_deadline])

  async function handleEndRequest() {
    if (!window.confirm(t.confirmMsg)) return
    const { data, error: closeError } = await closeRequest(requestId)
    if (closeError) { setError(closeError); return }
    setRequest(data)
  }

  if (error) {
    return <div className="frame"><div className="rt-error-text" style={{ padding: 20 }}>{error}</div></div>
  }
  if (!request) {
    return <div className="frame"><div style={{ padding: 20 }}>불러오는 중...</div></div>
  }

  const isOpen = request.status === 'open'

  return (
    <div className="frame">
      <div className="top-bar">
        <Link className="back-btn" to="/">←</Link>
        <div className="top-title">{t.topTitle}</div>
      </div>

      <div className="rs-body">
        <div className="rs-request-card">
          <div className="rs-request-card-header">
            <span className="rs-request-label">{t.reqLabel}</span>
            <div className={`rs-request-status${isOpen ? '' : ' closed'}`}>
              <div className="rs-status-dot"></div>
              <span>{isOpen ? t.statusOpen : t.statusClosed}</span>
            </div>
          </div>
          <div className="rs-request-summary">
            <span className="rs-summary-chip">📍 {request.region_text}</span>
            <span className="rs-summary-chip">{t.depositLabel} {Number(request.deposit_max ?? 0).toLocaleString()}만원 / {t.rentLabel} {request.rent_max ?? 0}만원</span>
            {(request.room_types || []).map((rt) => (
              <span className="rs-summary-chip" key={rt}>🏠 {getRoomTypeLabel(lang, rt)}</span>
            ))}
            {request.registration_required && <span className="rs-summary-chip">✅ {t.registrationYes}</span>}
          </div>
        </div>

        {isOpen && remaining && (
          <div className="rs-timer-card">
            <div className="rs-timer-label">{t.timerLabel}</div>
            {remaining.expired ? (
              <div className="rs-timer-sub">{t.timerExpired}</div>
            ) : (
              <>
                <div className="rs-timer-display">
                  <div className="rs-timer-block"><div className="rs-timer-num">{remaining.h}</div><div className="rs-timer-unit">{t.unitH}</div></div>
                  <div className="rs-timer-colon">:</div>
                  <div className="rs-timer-block"><div className="rs-timer-num">{remaining.m}</div><div className="rs-timer-unit">{t.unitM}</div></div>
                  <div className="rs-timer-colon">:</div>
                  <div className="rs-timer-block"><div className="rs-timer-num">{remaining.s}</div><div className="rs-timer-unit">{t.unitS}</div></div>
                </div>
                <div className="rs-timer-sub">{t.timerSub}</div>
              </>
            )}
          </div>
        )}

        <div className="rs-section-header">
          <div className="rs-section-title">{t.sectionTitle}</div>
          <div className="rs-section-count">{properties.length}</div>
        </div>

        {properties.length === 0 ? (
          <div className="rs-waiting-card">
            <div className="rs-waiting-emoji">⏳</div>
            <div className="rs-waiting-text">{t.waitingText}</div>
          </div>
        ) : (
          properties.map((p) => (
            <div className="rs-card" key={p.id}>
              <div className="rs-img">
                {p.property_images?.length > 0 ? (
                  <img
                    src={[...p.property_images].sort((a, b) => a.sort_order - b.sort_order)[0].image_url}
                    alt={p.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  '🏠'
                )}
                <div className="rs-type-badge">{getRoomTypeLabel(lang, p.room_type)}</div>
              </div>
              <div className="rs-body-inner">
                <div className="rs-agency">
                  <div className="rs-agency-avatar">🏢</div>
                  <div>
                    <div className="rs-agency-name">{p.realtor?.nickname || '공인중개사'}</div>
                    <div className="rs-agency-addr">{p.address}</div>
                  </div>
                </div>
                <div className="rs-price">
                  {t.rentLabel} {Number(p.monthly_rent ?? 0).toLocaleString()}만원
                  <span className="rs-deposit">{t.depositLabel} {Number(p.deposit ?? 0).toLocaleString()}만원</span>
                </div>
                {p.description && <div className="rs-message">{p.description}</div>}
                <div className="rs-actions">
                  <Link className="rs-btn rs-btn-secondary" to="/coming-soon">{t.detailBtn}</Link>
                  <Link className="rs-btn rs-btn-primary" to={`/chat/${p.id}`}>{t.chatBtn}</Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isOpen && (
        <div className="rs-bottom-cta">
          <button className="rs-end-btn" onClick={handleEndRequest}>{t.endBtn}</button>
        </div>
      )}
    </div>
  )
}
