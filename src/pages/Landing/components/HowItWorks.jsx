import { ClipboardList, Send, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '../../../context/LanguageContext'
import { useScrollReveal } from '../../../hooks/useScrollReveal'
import { landingText } from '../translations'
import './HowItWorks.css'

const ICONS = [ClipboardList, Send, CheckCircle2]

export default function HowItWorks() {
  const { lang } = useLanguage()
  const t = landingText[lang]
  const [ref, visible] = useScrollReveal()

  return (
    <section className={`how-it-works reveal${visible ? ' visible' : ''}`} ref={ref}>
      <h2 className="section-title">{t.howItWorksTitle}</h2>
      <div className="how-it-works-steps">
        {t.steps.map((step, i) => {
          const Icon = ICONS[i]
          return (
            <div className="how-it-works-step" key={step.title}>
              <div className="how-it-works-icon"><Icon size={20} strokeWidth={2} /></div>
              <div className="how-it-works-body">
                <div className="how-it-works-eyebrow">STEP {String(i + 1).padStart(2, '0')}</div>
                <div className="how-it-works-step-title">{step.title}</div>
                <div className="how-it-works-step-desc">{step.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
