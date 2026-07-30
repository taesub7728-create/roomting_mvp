import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '../../../context/LanguageContext'
import { landingText } from '../translations'
import './RequestCTA.css'

// Primary CTA — 이 페이지에서 유일한 브랜드 컬러(pink) 채움 버튼.
// /request는 이미 PublicCustomerRoute라 비로그인도 진입 가능 (제출 시점 로그인 유도는 RequestWizard 쪽 로직, 이번 범위 아님)
export default function RequestCTA() {
  const { lang } = useLanguage()
  const t = landingText[lang]

  return (
    <section className="request-cta">
      <Link className="request-cta-btn" to="/request">
        <span>{t.ctaRequestTitle}</span>
        <ArrowRight size={20} strokeWidth={2.25} />
      </Link>
      <p className="request-cta-trust">{t.trustLine}</p>
    </section>
  )
}
