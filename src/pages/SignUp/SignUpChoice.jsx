import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import logo from '../../assets/roomting-symbol.svg'
import { signupText, langOptions } from './translations'
import './SignUp.css'
import './SignUpChoice.css'

// 회원가입/로그인 통합 진입점: Step0 언어 선택 → Step1 일반회원/공인중개사 선택
// 각 선택 이후에는 /signup/customer, /signup/realtor에서 로그인과 가입을 함께 처리한다
export default function SignUpChoice() {
  const { lang, setLang } = useLanguage()
  const t = signupText[lang]
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  return (
    <div className="frame">
      <div className="top-logo">
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
        </div>
      </div>

      <div className="step-bar">
        <div className={`step-dot${step === 0 ? ' active' : step > 0 ? ' done' : ''}`}></div>
        <div className={`step-dot${step === 1 ? ' active' : ''}`}></div>
      </div>

      {step === 0 && (
        <div className="slide-wrap">
          <div className="slide-content">
            <div className="slide-eyebrow">{t.t1eyebrow}</div>
            <div className="slide-title">{t.t1}</div>
            <div className="slide-sub">{t.sub1}</div>
            <div className="lang-grid">
              {langOptions.map((o) => (
                <div
                  key={o.code}
                  className={`lang-card${lang === o.code ? ' selected' : ''}`}
                  onClick={() => setLang(o.code)}
                >
                  <span className="lang-card-flag">{o.flag}</span>
                  <span className="lang-card-name">{o.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="sc-wrap">
          <div>
            <div className="slide-eyebrow">{t.chooseEyebrow}</div>
            <div className="slide-title">{t.chooseTitle}</div>
            <div className="slide-sub">{t.chooseSub}</div>

            <div className="sc-choice-list">
              <button className="sc-choice-card" onClick={() => navigate('/signup/customer')}>
                <span className="sc-choice-emoji">🏠</span>
                <span className="sc-choice-title">{t.choiceCustomerTitle}</span>
                <span className="sc-choice-desc">{t.choiceCustomerDesc}</span>
              </button>
              <button className="sc-choice-card" onClick={() => navigate('/signup/realtor')}>
                <span className="sc-choice-emoji">🏢</span>
                <span className="sc-choice-title">{t.choiceRealtorTitle}</span>
                <span className="sc-choice-desc">{t.choiceRealtorDesc}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bottom-area">
        {step === 0 && (
          <button className="rt-btn-primary" onClick={() => setStep(1)}>{t.next}</button>
        )}
      </div>
    </div>
  )
}
