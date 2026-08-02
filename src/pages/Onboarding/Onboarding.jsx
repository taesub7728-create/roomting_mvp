import { useEffect, useRef, useState } from 'react'
import { MapPin, Wallet, Home as HomeIcon, Calendar, Building2 } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { onboardingText } from './translations'
import './Onboarding.css'

const FIELD_ICONS = { 'map-pin': MapPin, wallet: Wallet, home: HomeIcon, calendar: Calendar }

function RequestField({ field }) {
  const Icon = FIELD_ICONS[field.icon]
  return (
    <div className="ob-field">
      <div className="ob-field-label"><Icon size={14} strokeWidth={2} aria-hidden="true" />{field.label}</div>
      <div className="ob-field-value">{field.value}</div>
    </div>
  )
}

function RequestMockup({ data }) {
  return (
    <div className="ob-card ob-card-request">
      <div className="ob-card-title">{data.cardTitle}</div>
      <RequestField field={data.fields[0]} />
      <RequestField field={data.fields[1]} />
      <div className="ob-field-row">
        <RequestField field={data.fields[2]} />
        <RequestField field={data.fields[3]} />
      </div>
    </div>
  )
}

function ProposalsMockup({ data }) {
  return (
    <div className="ob-card ob-card-proposals">
      {data.cards.map((c) => (
        <div className="ob-proposal-card" key={c.name}>
          <div className="ob-proposal-icon"><Building2 size={18} strokeWidth={2} aria-hidden="true" /></div>
          <div className="ob-proposal-body">
            <div className="ob-proposal-top">
              <span className="ob-proposal-name">{c.name}</span>
              <span className="ob-proposal-badge">{c.badge}</span>
            </div>
            <div className="ob-proposal-price">{c.priceSummary}</div>
            <div className="ob-proposal-meta">{c.meta}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// 번역 API/Supabase chat과 연결하지 않는 정적 목업. incoming_bubble_1만 번역문/구분선/원문
// 3단 구조이고, incoming_bubble_2는 JSON 스펙상 이미 번역된 단일 문장만 보여주는 단순 구조다.
function ChatMockup({ data }) {
  return (
    <div className="ob-card ob-card-chat">
      <div className="ob-chat-header">{data.header}</div>
      <div className="ob-bubble ob-bubble-incoming">
        <div className="ob-bubble-label">{data.translatedLabel}</div>
        <div className="ob-bubble-translated">{data.incoming1Translated}</div>
        <div className="ob-bubble-divider" />
        <div className="ob-bubble-original">{data.incoming1Original}</div>
      </div>
      <div className="ob-bubble ob-bubble-outgoing">{data.outgoing1}</div>
      <div className="ob-bubble ob-bubble-incoming ob-bubble-plain">{data.incoming2}</div>
    </div>
  )
}

// Splash 이후 진입 분기(open 요청서 직행 / 재방문 스킵)와 완료 상태 저장(roomting_onboarding_seen_v1)은
// 커밋 3에서 연결한다. 이번 커밋은 /onboarding 직접 접근으로 화면 자체만 검증 가능하면 된다.
// onComplete는 "마지막 장 CTA" 또는 "Skip"을 눌렀을 때 호출되는 콜백 자리만 미리 마련해둔 것.
export default function Onboarding({ onComplete }) {
  const { lang } = useLanguage()
  // 온보딩 진행 중 전역 언어가 바뀌어도 화면 수/문구가 어긋나지 않도록 진입 시점 언어를 고정한다.
  const [lockedLang] = useState(() => lang)
  const t = onboardingText[lockedLang]
  const screens = t.screens

  const [index, setIndex] = useState(0)
  const headlineRef = useRef(null)
  const isFirstRenderRef = useRef(true)
  const screen = screens[index]
  const isLast = index === screens.length - 1

  // 첫 마운트 때는 포커스를 강제로 옮기지 않는다 - headline이 DOM상 Skip 버튼보다 뒤에 있어서,
  // 여기서 focus()를 걸면 이후 Tab이 Skip을 건너뛰고 바로 CTA로 가버려 키보드 사용자가
  // Skip에 도달하려면 Shift+Tab을 써야 하는 역효과가 생긴다. 슬라이드 전환(Next 클릭) 이후에만
  // 새 headline으로 포커스를 옮겨 스크린리더 사용자에게 새 내용을 알려준다.
  useEffect(() => {
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return }
    headlineRef.current?.focus()
  }, [index])

  function handleNext() {
    if (isLast) { onComplete?.(); return }
    setIndex((i) => i + 1)
  }

  function handleSkip() {
    onComplete?.()
  }

  return (
    <div className="frame ob-frame">
      <div className="ob-top">
        {screen.skipVisible && (
          <button type="button" className="ob-skip" onClick={handleSkip}>{t.skip}</button>
        )}
      </div>

      <h1 className="ob-headline" ref={headlineRef} tabIndex={-1}>{screen.headline}</h1>
      <p className="ob-sub">{screen.sub}</p>

      <div className="ob-visual">
        {screen.mockup.type === 'request' && <RequestMockup data={screen.mockup} />}
        {screen.mockup.type === 'proposals' && <ProposalsMockup data={screen.mockup} />}
        {screen.mockup.type === 'chat' && <ChatMockup data={screen.mockup} />}
      </div>

      <div className="ob-indicator" role="group" aria-label={t.stepLabel(index + 1, screens.length)}>
        {screens.map((s, i) => (
          <span key={s.id} className={`ob-dot${i === index ? ' active' : ''}`} aria-hidden="true" />
        ))}
      </div>

      <button type="button" className="ob-cta" onClick={handleNext}>{screen.cta}</button>
    </div>
  )
}
