import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Clock, CheckCircle2, MapPin, Home as HomeIcon, Wallet, Calendar, TriangleAlert } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { listMyRequests } from '../../api/requests.api'
import { deriveHomeState } from './deriveHomeState'
import { getRoomTypeLabel } from '../../utils/roomTypeLabel'
import { langOptions } from '../Landing/translations'
import { homeText } from './translations'
import { formatMoveInDate } from './moveInDateFormat'
import BottomTabBar from '../../components/BottomTabBar'
import symbolMark from '../../assets/roomting-symbol.svg'
import './CustomerHome.css'

// {n} 플레이스홀더를 기준으로 앞/뒤를 분리해 숫자만 강조 span으로 감싼다.
// split 결과가 정확히 2개가 아니어도(번역 문구에 {n}이 없거나 여러 번 있어도) 죽지 않게 방어.
function ResponseLine({ template, n }) {
  const parts = template.split('{n}')
  if (parts.length !== 2) return <p className="ch-response">{template.replace('{n}', String(n))}</p>
  return (
    <p className="ch-response">
      {parts[0]}
      <span className="ch-response-number">{n}</span>
      {parts[1]}
    </p>
  )
}

function LanguageToggle() {
  const { lang, setLang } = useLanguage()
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const current = langOptions.find((o) => o.code === lang) ?? langOptions[0]

  useEffect(() => {
    function handleOutsideClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])

  return (
    <div className="ch-lang-box" ref={boxRef}>
      <button type="button" className="ch-lang-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span aria-hidden="true">{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
      </button>
      <div className={`ch-lang-dd${open ? ' open' : ''}`}>
        {langOptions.map((o) => (
          <button type="button" key={o.code} onClick={() => { setLang(o.code); setOpen(false) }}>
            <span aria-hidden="true">{o.flag}</span> {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChHeader({ t }) {
  return (
    <header className="ch-header">
      <div className="ch-logo">
        <img src={symbolMark} alt="" className="ch-logo-mark" aria-hidden="true" />
        <span className="ch-logo-word">{t.wordmark}</span>
      </div>
      <LanguageToggle />
    </header>
  )
}

function StatusIcon({ icon: Icon }) {
  return (
    <div className="ch-icon-circle">
      <Icon size={24} strokeWidth={2} color="var(--coral)" aria-hidden="true" />
    </div>
  )
}

// value(한 줄) 또는 values(여러 줄 - 예산이 너무 길어 보증금/월세를 각자 줄로 나눠야 할 때) 중
// 하나를 받는다. 값 자체가 없으면(둘 다 비어있으면) row를 렌더하지 않는다(결측 필드는 숨김).
function SummaryRow({ icon: Icon, label, value, values }) {
  const lines = values ?? (value ? [value] : [])
  if (lines.length === 0) return null
  return (
    <div className="ch-summary-row">
      <Icon size={16} strokeWidth={2} className="ch-summary-icon" aria-hidden="true" />
      <div className="ch-summary-text">
        <span className="ch-summary-label">{label}</span>
        {lines.map((line, i) => (
          <span className="ch-summary-value" key={i}>{line}</span>
        ))}
      </div>
    </div>
  )
}

// region_text / room_types / budget / move_in_date 네 행 중 값이 있는 것만 렌더한다.
// 전부 없으면 요약 박스 자체를 렌더하지 않는다(가짜 빈 박스 방지).
function ConditionSummary({ rows }) {
  const visible = rows.filter((r) => r.value || (r.values && r.values.length > 0))
  if (visible.length === 0) return null
  return (
    <div className="ch-summary">
      {visible.map((r) => (
        <SummaryRow key={r.key} icon={r.icon} label={r.label} value={r.value} values={r.values} />
      ))}
    </div>
  )
}

function buildRoomType(lang, t, roomTypes) {
  if (!roomTypes || roomTypes.length === 0) return null
  const first = getRoomTypeLabel(lang, roomTypes[0])
  return t.roomTypesCombined(first, roomTypes.length - 1)
}

// 기본은 보증금·월세를 한 줄로 합친다. ja/en처럼 원화 환산 표기가 길어 한 줄로는
// 3줄 이상 넘치는 언어는 translations.js의 budgetSplitLines로 표시해 각자 줄로 나눈다.
function buildBudget(t, request) {
  const lines = []
  if (request.deposit_max != null) lines.push(t.depositLine(request.deposit_max))
  if (request.rent_max != null) lines.push(t.rentLine(request.rent_max))
  if (lines.length === 0) return { value: null, values: null }
  if (t.budgetSplitLines) return { value: null, values: lines }
  return { value: lines.join(' · '), values: null }
}

function CtaButton({ label, to }) {
  return (
    <Link className="ch-cta" to={to}>{label}</Link>
  )
}

function NoRequestCard({ t }) {
  return (
    <div className="ch-card">
      <StatusIcon icon={Search} />
      <h2 className="ch-card-title">{t.noRequest.title}</h2>
      <p className="ch-card-sub">{t.noRequest.sub}</p>
      <CtaButton label={t.noRequest.cta} to="/request" />
    </div>
  )
}

function WaitingCard({ t, lang, request }) {
  const n = Number(request.response_count ?? 0)
  const budget = buildBudget(t, request)
  return (
    <div className="ch-card">
      <StatusIcon icon={Clock} />
      <h2 className="ch-card-title">{t.waitingTitle}</h2>
      <ConditionSummary
        rows={[
          { key: 'area', icon: MapPin, label: t.areaLabel, value: request.region_text },
          { key: 'type', icon: HomeIcon, label: t.typeLabel, value: buildRoomType(lang, t, request.room_types) },
          { key: 'budget', icon: Wallet, label: t.budgetLabel, value: budget.value, values: budget.values },
          { key: 'moveIn', icon: Calendar, label: t.moveInLabel, value: formatMoveInDate(lang, request.move_in_date) },
        ]}
      />
      <div className="ch-divider" />
      <ResponseLine template={t.waitingResponse} n={n} />
      <CtaButton label={t.waitingCta} to={`/requests/${request.id}`} />
    </div>
  )
}

function WaitingEmptyCard({ t, lang, request }) {
  const budget = buildBudget(t, request)
  return (
    <div className="ch-card">
      <StatusIcon icon={Clock} />
      <h2 className="ch-card-title">{t.waitingTitle}</h2>
      <ConditionSummary
        rows={[
          { key: 'area', icon: MapPin, label: t.areaLabel, value: request.region_text },
          { key: 'type', icon: HomeIcon, label: t.typeLabel, value: buildRoomType(lang, t, request.room_types) },
          { key: 'budget', icon: Wallet, label: t.budgetLabel, value: budget.value, values: budget.values },
          { key: 'moveIn', icon: Calendar, label: t.moveInLabel, value: formatMoveInDate(lang, request.move_in_date) },
        ]}
      />
      <div className="ch-divider" />
      <div className="ch-empty-message">
        <p className="ch-empty-title">{t.emptyTitle}</p>
        <p className="ch-empty-sub">{t.emptySub}</p>
      </div>
      <CtaButton label={t.waitingCta} to={`/requests/${request.id}`} />
    </div>
  )
}

function ClosedCard({ t, lang, request }) {
  const n = Number(request.response_count ?? 0)
  return (
    <div className="ch-card">
      <StatusIcon icon={CheckCircle2} />
      <h2 className="ch-card-title">{t.closedTitle}</h2>
      <ConditionSummary
        rows={[
          { key: 'area', icon: MapPin, label: t.areaLabel, value: request.region_text },
          { key: 'type', icon: HomeIcon, label: t.typeLabel, value: buildRoomType(lang, t, request.room_types) },
        ]}
      />
      <div className="ch-divider" />
      <ResponseLine template={t.closedResponse} n={n} />
      <p className="ch-card-sub">{t.closedSub}</p>
      <CtaButton label={t.closedCta} to="/request" />
    </div>
  )
}

function ErrorCard({ t, onRetry }) {
  return (
    <div className="ch-card">
      <StatusIcon icon={TriangleAlert} />
      <h2 className="ch-card-title">{t.error.title}</h2>
      <button type="button" className="ch-cta" onClick={onRetry}>{t.error.retry}</button>
    </div>
  )
}

function StatusCardSkeleton({ loadingLabel }) {
  return (
    <div className="ch-card ch-skeleton">
      <span className="ch-sr-only">{loadingLabel}</span>
      <div className="ch-skel ch-skel-icon" aria-hidden="true" />
      <div className="ch-skel ch-skel-title" aria-hidden="true" />
      <div className="ch-skel ch-skel-title-2" aria-hidden="true" />
      <div className="ch-skel ch-skel-box" aria-hidden="true" />
      <div className="ch-skel ch-skel-cta" aria-hidden="true" />
    </div>
  )
}

export default function CustomerHome() {
  const { lang } = useLanguage()
  const t = homeText[lang]
  const [state, setState] = useState({ status: 'loading', request: null })

  const load = useCallback(() => {
    setState({ status: 'loading', request: null })
    let cancelled = false
    listMyRequests().then(({ data, error }) => {
      if (cancelled) return
      // 조회 실패를 "요청 없음"으로 위장하지 않는다 - 실제 요청이 있는 사용자가
      // 중복으로 새 요청을 작성하게 되는 것을 막기 위해 별도 오류 카드로 알린다.
      if (error || !data) { setState({ status: 'error', request: null }); return }
      setState(deriveHomeState(data))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => load(), [load])

  return (
    <div className="frame ch-frame">
      <ChHeader t={t} />
      {state.status === 'loading' && <StatusCardSkeleton loadingLabel={t.loading} />}
      {state.status === 'error' && <ErrorCard t={t} onRetry={load} />}
      {state.status === 'no_request' && <NoRequestCard t={t} />}
      {state.status === 'waiting' && <WaitingCard t={t} lang={lang} request={state.request} />}
      {state.status === 'waiting_empty' && <WaitingEmptyCard t={t} lang={lang} request={state.request} />}
      {state.status === 'closed' && <ClosedCard t={t} lang={lang} request={state.request} />}
      <div className="ch-spacer" />
      <BottomTabBar />
    </div>
  )
}

export { NoRequestCard, WaitingCard, WaitingEmptyCard, ClosedCard, ErrorCard, StatusCardSkeleton }
