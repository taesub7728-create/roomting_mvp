import { Link } from 'react-router-dom'
import { Map } from 'lucide-react'
import { useLanguage } from '../../../context/LanguageContext'
import { landingText } from '../translations'
import './BrowseCTA.css'

// Secondary CTA — 아웃라인 스타일, Primary보다 확실히 낮은 시각적 무게.
// /map도 이미 PublicCustomerRoute라 비로그인 진입 가능
export default function BrowseCTA() {
  const { lang } = useLanguage()
  const t = landingText[lang]

  return (
    <section className="browse-cta">
      <Link className="browse-cta-btn" to="/map">
        <Map size={17} strokeWidth={2} />
        <span>{t.ctaBrowseTitle}</span>
      </Link>
    </section>
  )
}
