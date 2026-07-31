import { v3Text as t } from '../translations'
import './HeroV3.css'

// 헤드라인 + 서브텍스트만 담당. Fold 안에 반드시 들어와야 해서 스크롤 등장 효과 없음(로드 즉시 노출)
export default function HeroV3() {
  return (
    <section className="hero-v3">
      <h1 className="hero-v3-title">{t.heroTitle}</h1>
      <p className="hero-v3-subtitle">{t.heroSubtitle}</p>
    </section>
  )
}
