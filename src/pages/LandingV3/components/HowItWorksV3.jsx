import { PencilLine, Send, GitCompare } from 'lucide-react'
import { useScrollReveal } from '../../../hooks/useScrollReveal'
import { v3Text as t } from '../translations'
import './HowItWorksV3.css'

// 아이콘을 범용 아이콘이 아니라 "조건 작성 → 제안 전송 → 비교"라는 흐름 자체에 대응하는
// 아이콘으로 의도적으로 선택 (GitCompare는 실제로 "비교"를 의미하는 아이콘)
const STEP_STYLE = [
  { Icon: PencilLine, className: 'step-pink' },
  { Icon: Send, className: 'step-neutral' },
  { Icon: GitCompare, className: 'step-success' },
]

export default function HowItWorksV3() {
  const [ref, visible] = useScrollReveal()

  return (
    <section className={`how-it-works-v3 reveal-v3${visible ? ' visible' : ''}`} ref={ref}>
      <h2 className="section-title-v3">{t.howItWorksTitle}</h2>
      <div className="how-it-works-v3-steps">
        {t.steps.map((step, i) => {
          const { Icon, className } = STEP_STYLE[i]
          return (
            <div className="how-it-works-v3-step" key={step.title}>
              <div className={`how-it-works-v3-icon ${className}`}><Icon size={19} strokeWidth={2.25} /></div>
              <div className="how-it-works-v3-step-title">{step.title}</div>
              <div className="how-it-works-v3-step-desc">{step.desc}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
