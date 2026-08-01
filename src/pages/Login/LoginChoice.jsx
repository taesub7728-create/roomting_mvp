import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Home, Building2 } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth } from '../../shared/auth/useAuth'
import { homePathForRole } from '../../shared/auth/homePathForRole'
import logo from '../../assets/roomting-symbol.svg'
import { loginChoiceText } from './translations'
import '../SignUp/SignUpChoice.css'

// 로그인 전용 진입점: 계정 유형만 고른 뒤 각자의 로그인 화면(/login/customer, /login/realtor)으로 보냄.
// 회원가입 흐름(SignUpChoice)과 분리된 별도 화면이라, 언어선택 없이 딱 이 선택만 함
export default function LoginChoice() {
  const { lang } = useLanguage()
  const t = loginChoiceText[lang]
  const navigate = useNavigate()
  const { user, profile, authLoading, profileLoading } = useAuth()

  // 이미 로그인 + profile까지 확정된 사용자에게는 선택 화면을 아예 보여주지 않는다
  if (authLoading || profileLoading) return null
  if (user && profile) return <Navigate to={homePathForRole(profile.role)} replace />

  return (
    <div className="frame">
      <div className="top-logo">
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
        </div>
      </div>

      <div className="sc-wrap">
        <div>
          <div className="slide-eyebrow">{t.eyebrow}</div>
          <div className="slide-title">{t.title}</div>
          <div className="slide-sub">{t.sub}</div>

          <div className="sc-choice-list">
            <button className="sc-choice-card" onClick={() => navigate('/login/customer')}>
              <Home size={26} strokeWidth={1.75} color="var(--coral)" />
              <span className="sc-choice-title">{t.choiceCustomerTitle}</span>
              <span className="sc-choice-desc">{t.choiceCustomerDesc}</span>
            </button>
            <button className="sc-choice-card" onClick={() => navigate('/login/realtor')}>
              <Building2 size={26} strokeWidth={1.75} color="var(--coral)" />
              <span className="sc-choice-title">{t.choiceRealtorTitle}</span>
              <span className="sc-choice-desc">{t.choiceRealtorDesc}</span>
            </button>
          </div>

          <div className="login-signup-link" style={{ marginTop: 20, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)' }}>
            {t.noAccount} <Link to="/signup" style={{ color: 'var(--coral)', fontWeight: 700, textDecoration: 'none' }}>{t.signupLink}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
