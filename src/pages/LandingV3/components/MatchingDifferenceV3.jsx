import { X, Check, GitBranch } from 'lucide-react'
import { useScrollReveal } from '../../../hooks/useScrollReveal'
import { v3Text as t } from '../translations'
import './MatchingDifferenceV3.css'

// V1의 WhyRoomting과 동일한 정보구조(텍스트 대조 리스트, 카드그리드/사진 없음)를 재사용하고
// 시각 스타일만 Premium Marketplace 톤으로 새로 입힘. GitBranch 아이콘으로 "하나의 조건이
// 여러 갈래 제안으로 뻗어나간다"는 흐름 언어를 Hero 그래픽과 통일감 있게 이어감
export default function MatchingDifferenceV3() {
  const [ref, visible] = useScrollReveal()

  return (
    <section className={`matching-diff-v3 reveal-v3${visible ? ' visible' : ''}`} ref={ref}>
      <h2 className="section-title-v3">{t.whyTitle}</h2>

      <div className="matching-diff-v3-grid">
        <div className="diff-col-v3 diff-col-v3-old">
          <div className="diff-col-v3-label">{t.whyOldLabel}</div>
          <ul className="diff-col-v3-list">
            {t.whyOldPoints.map((point) => (
              <li key={point}><X size={15} strokeWidth={2.5} /><span>{point}</span></li>
            ))}
          </ul>
        </div>

        <div className="diff-col-v3 diff-col-v3-new">
          <div className="diff-col-v3-badge">{t.whyNewBadge}</div>
          <div className="diff-col-v3-label"><GitBranch size={15} strokeWidth={2.5} /> {t.whyNewLabel}</div>
          <ul className="diff-col-v3-list">
            {t.whyNewPoints.map((point) => (
              <li key={point}><Check size={15} strokeWidth={2.5} /><span>{point}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
