import { X, Check } from 'lucide-react'
import { useLanguage } from '../../../context/LanguageContext'
import { useScrollReveal } from '../../../hooks/useScrollReveal'
import { landingText } from '../translations'
import './WhyRoomting.css'

// 핵심 차별점 섹션: "직접 찾는 방식"과 "제안받는 방식(ROOMTING)"을 대조.
// 검색 중심이 아니라 역매칭 구조라는 걸 시각적으로 각인시키는 게 목적
export default function WhyRoomting() {
  const { lang } = useLanguage()
  const t = landingText[lang]
  const [ref, visible] = useScrollReveal()

  return (
    <section className={`why-roomting reveal${visible ? ' visible' : ''}`} ref={ref}>
      <h2 className="section-title">{t.whyTitle}</h2>

      <div className="why-roomting-grid">
        <div className="why-col why-col-old">
          <div className="why-col-label">{t.whyOldLabel}</div>
          <ul className="why-col-list">
            {t.whyOldPoints.map((point) => (
              <li key={point}><X size={15} strokeWidth={2.5} /><span>{point}</span></li>
            ))}
          </ul>
        </div>

        <div className="why-col why-col-new">
          <div className="why-col-badge">{t.whyNewBadge}</div>
          <div className="why-col-label">{t.whyNewLabel}</div>
          <ul className="why-col-list">
            {t.whyNewPoints.map((point) => (
              <li key={point}><Check size={15} strokeWidth={2.5} /><span>{point}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
