import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { signUpWithEmail, signInWithOAuth, updateOwnProfile, getSession } from '../../api/auth.api'
import logo from '../../assets/roomting-logo-symbol.png'
import { signupText, langOptions } from './translations'
import './SignUp.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignUp() {
  const { lang, setLang } = useLanguage()
  const t = signupText[lang]
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  // 소셜 로그인 후 브라우저가 돌아왔을 때는 이미 계정이 생성된 상태이므로,
  // 닉네임 단계에서 새로 가입하는 대신 프로필 정보만 업데이트한다
  const [finalizeMode, setFinalizeMode] = useState(false)

  const [authMethod, setAuthMethod] = useState(null) // 'google' | 'kakao' | 'line' | 'email'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false) // 가입 완료 (바로 로그인된 상태)
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false) // 이메일 인증 대기

  useEffect(() => {
    async function checkExistingSession() {
      const session = await getSession()
      if (session) {
        setFinalizeMode(true)
        setStep(2)
      }
    }
    checkExistingSession()
  }, [])

  const nickTrimmed = nickname.trim()
  const nickValid = nickTrimmed.length >= 2 && nickTrimmed.length <= 16
  const emailValid = EMAIL_RE.test(email.trim())
  const passwordValid = password.length >= 6

  function selectLang(code) {
    setLang(code)
  }

  async function handleOAuth(provider) {
    setError(null)
    setLoading(true)
    const redirectTo = `${window.location.origin}/signup`
    const { error } = await signInWithOAuth(provider, redirectTo)
    // 성공하면 브라우저가 그대로 로그인 페이지로 이동하므로 이 아래 코드는 실패했을 때만 실행됨
    if (error) {
      setError(error)
      setLoading(false)
    }
  }

  function chooseEmail() {
    setAuthMethod('email')
  }

  function goToNickname() {
    setError(null)
    setStep(2)
  }

  async function handleFinish() {
    setError(null)
    setLoading(true)

    if (finalizeMode) {
      const { error } = await updateOwnProfile({ nickname: nickTrimmed, preferredLanguage: lang })
      setLoading(false)
      if (error) { setError(error); return }
      setDone(true)
      return
    }

    const { data, error } = await signUpWithEmail({
      email: email.trim(),
      password,
      nickname: nickTrimmed,
      role: 'customer',
      preferredLanguage: lang,
    })
    setLoading(false)
    if (error) { setError(error); return }

    if (data?.session) {
      setDone(true)
    } else {
      // Supabase 프로젝트의 "이메일 확인" 설정이 켜져 있으면 세션 없이 가입만 되고, 이메일 인증 후 로그인 가능
      setAwaitingEmailConfirm(true)
    }
  }

  return (
    <div className="frame signup-frame">
      <div className="ambient amb-1"></div>
      <div className="ambient amb-2"></div>

      <div className="top-logo">
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
          <div className="rt-logo-divider"></div>
          <span className="rt-logo-tagline">{t.tagline}</span>
        </div>
      </div>

      {!finalizeMode && (
        <div className="step-bar">
          <div className={`step-dot${step === 0 ? ' active' : step > 0 ? ' done' : ''}`}></div>
          <div className={`step-dot${step === 1 ? ' active' : step > 1 ? ' done' : ''}`}></div>
          <div className={`step-dot${step === 2 ? ' active' : ''}`}></div>
        </div>
      )}

      {/* STEP 0: 언어 선택 */}
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
                  onClick={() => selectLang(o.code)}
                >
                  <span className="lang-card-flag">{o.flag}</span>
                  <span className="lang-card-name">{o.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: 로그인 방식 선택 */}
      {step === 1 && (
        <div className="slide-wrap">
          <div className="slide-content">
            <div className="slide-eyebrow">{t.t2eyebrow}</div>
            <div className="slide-title">{t.t2}</div>
            <div className="slide-sub">{t.sub2}</div>

            <div className="social-btns">
              <button className="social-btn" disabled={loading} onClick={() => handleOAuth('google')}>
                <span className="social-icon">G</span>
                <span>{t.google}</span>
              </button>
              <button className="social-btn btn-kakao" disabled={loading} onClick={() => handleOAuth('kakao')}>
                <span className="social-icon">K</span>
                <span>{t.kakao}</span>
              </button>
              <button className="social-btn btn-line" disabled={loading} onClick={() => handleOAuth('line')}>
                <span className="social-icon">L</span>
                <span>{t.line}</span>
              </button>

              <div className="divider">
                <div className="divider-line"></div>
                <div className="divider-text">{t.or}</div>
                <div className="divider-line"></div>
              </div>

              <button className="social-btn btn-email" onClick={chooseEmail}>
                <span className="social-icon">✉</span>
                <span>{t.email}</span>
              </button>

              {authMethod === 'email' && (
                <div className="email-form">
                  <div>
                    <label className="input-label">{t.emailLabel}</label>
                    <input
                      className="rt-input"
                      type="email"
                      placeholder={t.emailPlaceholder}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="input-label">{t.pwLabel}</label>
                    <input
                      className="rt-input"
                      type="password"
                      placeholder={t.pwPlaceholder}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="terms">{t.terms}</div>
            {error && <div className="rt-error-text">{error}</div>}
          </div>
        </div>
      )}

      {/* STEP 2: 닉네임 */}
      {step === 2 && (
        <div className="slide-wrap">
          <div className="slide-content">
            <div className="slide-eyebrow">{t.t3eyebrow}</div>
            <div className="slide-title">{t.t3}</div>
            <div className="slide-sub">{t.sub3}</div>

            <label className="input-label">{t.nickLabel}</label>
            <input
              className="rt-input"
              type="text"
              maxLength={16}
              autoComplete="off"
              placeholder={t.nickPlaceholder}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            {nickTrimmed.length > 0 && (
              <div className={`nick-hint ${nickValid ? 'ok' : 'err'}`}>
                {nickValid ? t.nickOk : nickTrimmed.length < 2 ? t.nickShort : t.nickLong}
              </div>
            )}
            {error && <div className="rt-error-text">{error}</div>}
          </div>
        </div>
      )}

      <div className="bottom-area">
        {step === 0 && (
          <button className="rt-btn-primary" onClick={() => setStep(1)}>{t.next}</button>
        )}
        {step === 1 && authMethod === 'email' && (
          <button
            className="rt-btn-primary"
            disabled={!emailValid || !passwordValid}
            onClick={goToNickname}
          >
            {t.next}
          </button>
        )}
        {step === 2 && (
          <button className="rt-btn-primary" disabled={!nickValid || loading} onClick={handleFinish}>
            {t.start}
          </button>
        )}
      </div>

      {done && (
        <div className="done-overlay">
          <div className="done-icon-wrap"><img src={logo} alt="roomting" /></div>
          <div className="done-title">{t.doneTitle}<br /><span className="accent">{nickTrimmed}</span></div>
          <div className="done-sub">{t.doneSub}</div>
          <button className="rt-btn-primary" onClick={() => navigate('/')}>{t.doneBtn}</button>
        </div>
      )}

      {awaitingEmailConfirm && (
        <div className="done-overlay">
          <div className="done-icon-wrap"><img src={logo} alt="roomting" /></div>
          <div className="done-title">{t.confirmTitle}</div>
          <div className="done-sub">{t.confirmSub}</div>
          <button className="rt-btn-primary" onClick={() => navigate('/')}>{t.confirmBtn}</button>
        </div>
      )}
    </div>
  )
}
