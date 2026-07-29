import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { signUpWithEmail, signInWithEmail, signInWithOAuth, updateOwnProfile, getSession, getCurrentProfile } from '../../api/auth.api'
import { createRequest } from '../../api/requests.api'
import { PENDING_REQUEST_KEY } from '../RequestWizard/RequestWizard'
import { redirectForRole } from '../../utils/redirectForRole'
import { useAuth } from '../../shared/auth/useAuth'
import { homePathForRole } from '../../shared/auth/homePathForRole'
import logo from '../../assets/roomting-symbol.svg'
import { signupText } from './translations'
import './SignUp.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// mode: 'signup'(기본, /signup/customer) | 'login'(/login/customer - 로그인 전용 화면, 가입 유도 없음)
export default function SignUp({ mode = 'signup' }) {
  const { lang } = useLanguage()
  const t = signupText[lang]
  const navigate = useNavigate()
  const { user, profile, authLoading, profileLoading } = useAuth()

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
  const [pendingRequestError, setPendingRequestError] = useState(null)
  const [submittedRequestId, setSubmittedRequestId] = useState(null)

  // 로그인 없이 조건 요청서를 작성하다가 가입하러 온 경우, 가입이 끝나자마자 그 내용을 이어서 제출
  async function submitPendingRequestIfAny() {
    const raw = localStorage.getItem(PENDING_REQUEST_KEY)
    if (!raw) return
    localStorage.removeItem(PENDING_REQUEST_KEY)
    try {
      const payload = JSON.parse(raw)
      const { data, error } = await createRequest(payload)
      if (error) setPendingRequestError(error)
      else setSubmittedRequestId(data.id)
    } catch {
      // 저장된 내용을 읽지 못하면 조용히 무시 (가입 자체는 이미 성공한 상태이므로)
    }
  }

  useEffect(() => {
    async function checkExistingSession() {
      const session = await getSession()
      if (!session) return

      // 이미 닉네임까지 있는 계정이면(기존 회원) 소셜 로그인으로 온 것이므로 바로 로그인 처리
      const { data: profile } = await getCurrentProfile()
      if (profile?.nickname) {
        redirectForRole(navigate, profile.role)
        return
      }
      // 닉네임이 없으면 소셜 가입 직후 처음 들어온 것 → 닉네임만 채우면 가입 완료
      setFinalizeMode(true)
      setStep(1)
    }
    checkExistingSession()
  }, [navigate])

  const nickTrimmed = nickname.trim()
  const nickValid = nickTrimmed.length >= 2 && nickTrimmed.length <= 16
  const emailValid = EMAIL_RE.test(email.trim())
  const passwordValid = password.length >= 6

  async function handleOAuth(provider) {
    setError(null)
    setLoading(true)
    const redirectTo = `${window.location.origin}/signup/customer`
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
    setStep(1)
  }

  async function handleLogin() {
    setError(null)
    setLoading(true)
    const { error: loginError } = await signInWithEmail({ email: email.trim(), password })
    if (loginError) { setLoading(false); setError(loginError); return }

    const { data: profile } = await getCurrentProfile()
    await submitPendingRequestIfAny()
    setLoading(false)
    redirectForRole(navigate, profile?.role)
  }

  async function handleFinish() {
    setError(null)
    setLoading(true)

    if (finalizeMode) {
      const { error } = await updateOwnProfile({ nickname: nickTrimmed, preferredLanguage: lang })
      setLoading(false)
      if (error) { setError(error); return }
      setDone(true)
      await submitPendingRequestIfAny()
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
      await submitPendingRequestIfAny()
    } else {
      // Supabase 프로젝트의 "이메일 확인" 설정이 켜져 있으면 세션 없이 가입만 되고, 이메일 인증 후 로그인 가능
      setAwaitingEmailConfirm(true)
    }
  }

  // 로그인 전용 화면(mode==='login')에서는 이미 로그인 + profile까지 확정된 사용자에게
  // 로그인 폼이 잠깐이라도 보이지 않도록 렌더 단계에서 먼저 처리한다.
  // (mode==='signup'일 때는 위 checkExistingSession의 OAuth 콜백 처리 로직이 별도로 담당하므로 여기서는 손대지 않음)
  if (mode === 'login') {
    if (authLoading || profileLoading) return null
    if (user && profile) return <Navigate to={homePathForRole(profile.role)} replace />
  }

  return (
    <div className="frame signup-frame">
      <div className="ambient amb-1"></div>
      <div className="ambient amb-2"></div>

      <div className="top-logo">
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
        </div>
      </div>

      {!finalizeMode && mode !== 'login' && (
        <div className="step-bar">
          <div className={`step-dot${step === 0 ? ' active' : step > 0 ? ' done' : ''}`}></div>
          <div className={`step-dot${step === 1 ? ' active' : ''}`}></div>
        </div>
      )}

      {/* STEP 0: 로그인 방식 선택 */}
      {step === 0 && (
        <div className="slide-wrap">
          <div className="slide-content">
            <div className="slide-eyebrow">{mode === 'login' ? t.loginEyebrow : t.t2eyebrow}</div>
            <div className="slide-title">{mode === 'login' ? t.loginTitle : t.t2}</div>
            <div className="slide-sub">{mode === 'login' ? t.loginSub : t.sub2}</div>

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
                <span className="social-icon"><Mail size={16} strokeWidth={2} /></span>
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

      {/* STEP 1: 닉네임 */}
      {step === 1 && (
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
        {step === 0 && authMethod === 'email' && mode === 'login' && (
          <button
            className="rt-btn-primary"
            disabled={!emailValid || !passwordValid || loading}
            onClick={handleLogin}
          >
            {t.loginBtn}
          </button>
        )}
        {step === 0 && authMethod === 'email' && mode !== 'login' && (
          <>
            <button
              className="rt-btn-primary"
              disabled={!emailValid || !passwordValid || loading}
              onClick={goToNickname}
            >
              {t.signupBtn}
            </button>
            <button
              className="rt-btn-secondary"
              disabled={!emailValid || !passwordValid || loading}
              onClick={handleLogin}
            >
              {t.haveAccount} {t.loginBtn}
            </button>
          </>
        )}
        {step === 1 && (
          <button className="rt-btn-primary" disabled={!nickValid || loading} onClick={handleFinish}>
            {t.start}
          </button>
        )}
        {mode === 'login' && step === 0 && (
          <>
            <div className="signup-no-account">
              {t.noAccount} <Link to="/signup" className="signup-inline-link">{t.signupLink}</Link>
            </div>
            <Link to="/login" className="signup-back-link">← 로그인 유형 다시 선택하기</Link>
          </>
        )}
      </div>

      {done && (
        <div className="done-overlay">
          <div className="done-icon-wrap"><img src={logo} alt="roomting" /></div>
          <div className="done-title">{t.doneTitle}<br /><span className="accent">{nickTrimmed}</span></div>
          <div className="done-sub">{t.doneSub}</div>
          {pendingRequestError && <div className="rt-error-text" style={{ marginBottom: 12 }}>{pendingRequestError}</div>}
          <button className="rt-btn-primary" onClick={() => navigate(submittedRequestId ? `/requests/${submittedRequestId}` : '/')}>{t.doneBtn}</button>
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
