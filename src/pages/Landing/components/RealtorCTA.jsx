import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useLanguage } from '../../../context/LanguageContext'
import { useScrollReveal } from '../../../hooks/useScrollReveal'
import { landingText } from '../translations'
import './RealtorCTA.css'

// 소비자용 Primary/Secondary CTA와 경쟁하지 않는 3순위 링크 배너.
// /signup/realtor는 기존 라우트 그대로 재사용
export default function RealtorCTA() {
  const { lang } = useLanguage()
  const t = landingText[lang]
  const [ref, visible] = useScrollReveal()

  return (
    <section className={`realtor-cta reveal${visible ? ' visible' : ''}`} ref={ref}>
      <Link to="/signup/realtor" className="realtor-cta-link">
        <span>{t.realtorCtaText} <strong>{t.realtorCtaLink}</strong></span>
        <ChevronRight size={16} strokeWidth={2} />
      </Link>
    </section>
  )
}
