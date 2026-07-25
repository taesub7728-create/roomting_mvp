import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { getCurrentProfile, signOut } from '../../api/auth.api'
import logo from '../../assets/roomting-logo-symbol.png'
import { landingText, langOptions } from './translations'
import './Landing.css'

export default function Landing() {
  const { lang, setLang } = useLanguage()
  const t = landingText[lang]

  const [langOpen, setLangOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [howTab, setHowTab] = useState(0)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const langBoxRef = useRef(null)
  const profileBoxRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      const { data, error } = await getCurrentProfile()
      if (cancelled) return
      if (error) setProfileError(error)
      else setProfile(data)
    }
    loadProfile()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function handleOutsideClick(e) {
      if (langBoxRef.current && !langBoxRef.current.contains(e.target)) setLangOpen(false)
      if (profileBoxRef.current && !profileBoxRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])

  const currentLangOption = langOptions.find((o) => o.code === lang) ?? langOptions[0]

  async function handleLogout() {
    const { error } = await signOut()
    if (error) {
      setProfileError(error)
      return
    }
    setProfile(null)
    setProfileOpen(false)
  }

  const steps = howTab === 0 ? t.steps0 : t.steps1

  return (
    <div className="frame">
      <header className="landing-header">
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
          <div className="rt-logo-divider"></div>
          <span className="rt-logo-tagline">{t.tagline}</span>
        </div>

        <div className="header-actions">
          <div className="lang-box" ref={langBoxRef}>
            <button className="lang-btn" onClick={() => setLangOpen((v) => !v)}>
              <span>{currentLangOption.flag}</span>
              <span>{currentLangOption.label}</span>
            </button>
            <div className={`lang-dd${langOpen ? ' open' : ''}`}>
              {langOptions.map((o) => (
                <div key={o.code} onClick={() => { setLang(o.code); setLangOpen(false) }}>
                  {o.flag} {o.label}
                </div>
              ))}
            </div>
          </div>

          {profile ? (
            <div className="profile-box" ref={profileBoxRef}>
              <button className="profile-btn" onClick={() => setProfileOpen((v) => !v)}>
                {(profile.nickname || '?').charAt(0).toUpperCase()}
              </button>
              <div className={`profile-dd${profileOpen ? ' open' : ''}`}>
                <Link to="/mypage" onClick={() => setProfileOpen(false)}>👤 {t.mypage}</Link>
                <div className="dd-logout" onClick={handleLogout}>🚪 {t.logout}</div>
              </div>
            </div>
          ) : (
            <Link className="login-link" to="/signup">{t.login}</Link>
          )}
        </div>
      </header>

      {profileError && <div className="rt-error-text" style={{ padding: '0 22px' }}>{profileError}</div>}

      <div className="hero">
        <div className="hero-eyebrow"><span className="eyebrow-dot"></span>{t.eyebrow}</div>
        <h1>{t.heroTitle}</h1>
        <p className="hero-sub">{t.heroSub}</p>
      </div>

      <div className="cards">
        <Link className="card primary" to="/request">
          <div className="card-icon">📋</div>
          <div>
            <div className="card-title">{t.cardRequestTitle}</div>
            <div className="card-desc">{t.cardRequestDesc}</div>
          </div>
          <span className="card-arrow">→</span>
        </Link>
        <Link className="card" to="/map">
          <div className="card-icon">🗺️</div>
          <div>
            <div className="card-title">{t.cardMapTitle}</div>
            <div className="card-desc">{t.cardMapDesc}</div>
          </div>
          <span className="card-arrow">→</span>
        </Link>
      </div>

      <div className="quick-stats">
        <div className="quick-stat">
          <div className="quick-stat-num">30+</div>
          <div className="quick-stat-label">{t.statPartners}</div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-num">24h</div>
          <div className="quick-stat-label">{t.statResponse}</div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-num">4</div>
          <div className="quick-stat-label">{t.statLangs}</div>
        </div>
      </div>

      <section className="how-section">
        <div className="how-title">{t.howTitle}</div>
        <div className="how-tabs">
          <button className={`how-tab${howTab === 0 ? ' active' : ''}`} onClick={() => setHowTab(0)}>{t.howTab0}</button>
          <button className={`how-tab${howTab === 1 ? ' active' : ''}`} onClick={() => setHowTab(1)}>{t.howTab1}</button>
        </div>
        <div className="how-steps">
          {steps.map(([title, desc], i) => (
            <div className="how-step" key={i}>
              <div className="how-num">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <div className="how-text-title">{title}</div>
                <div className="how-text-desc">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        {t.footerHelp} <a href="#">{t.footerContact}</a>
      </footer>
    </div>
  )
}
