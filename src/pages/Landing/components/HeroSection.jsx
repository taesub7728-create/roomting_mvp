import { useLanguage } from '../../../context/LanguageContext'
import { landingText } from '../translations'
import logoMark from '../../../assets/roomting-symbol.svg'
import './HeroSection.css'

// 헤드라인 + 서브텍스트만 담당 (CTA 버튼은 RequestCTA/BrowseCTA가 별도로 그림).
// 첫 화면(Fold) 안에 반드시 들어와야 하는 영역이라 스크롤 등장 효과(useScrollReveal)를
// 적용하지 않음 - 로드 즉시 보여야 함.
// hero-mark: 모바일 전용 브랜드 각인 비트(작게). 데스크톱은 hero-graphic 컬럼이 그 역할을
// 대신하므로 여기선 숨김(HeroSection.css 참고)
export default function HeroSection() {
  const { lang } = useLanguage()
  const t = landingText[lang]

  return (
    <section className="hero-section">
      <img className="hero-mark" src={logoMark} alt="" aria-hidden="true" />
      <h1 className="hero-title">{t.heroTitle}</h1>
      <p className="hero-subtitle">{t.heroSubtitle}</p>
    </section>
  )
}
