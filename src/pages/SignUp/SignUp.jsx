import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { signUpWithEmail, signInWithEmail, signInWithOAuth, updateOwnProfile, getSession, getCurrentProfile } from '../../api/auth.api'
import { createRequest, SESSION_REQUIRED_ERROR } from '../../api/requests.api'
import { PENDING_REQUEST_KEY, PENDING_REQUEST_TTL_MS } from '../RequestWizard/RequestWizard'
import { redirectForRole } from '../../utils/redirectForRole'
import { useAuth } from '../../shared/auth/useAuth'
import { homePathForRole } from '../../shared/auth/homePathForRole'
import logo from '../../assets/roomting-symbol.svg'
import { signupText } from './translations'
import './SignUp.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// PENDING_REQUEST_KEY에 저장된 문자열을 파싱하고 상태를 판정한다(순수 함수 - 컴포넌트 state 없음).
// - JSON 자체가 깨졌거나 객체가 아님 → invalid
// - savedAt/payload 래퍼 흔적이 전혀 없음(래퍼 도입 이전 포맷) → 저장 시각을 알 수 없어 신선도를
//   보장 못 하므로 손상이 아니라 "오래됨(expired)"으로 간주해 다시 작성을 유도한다
// - 래퍼 흔적은 있는데 savedAt이 숫자가 아니거나 0 이하이거나 미래 시각이거나 payload가 객체가 아님 → invalid
// - 래퍼 정상 + TTL 이내 → ok, 아니면 → expired
function classifyStoredPending(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'invalid' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'invalid' }
  }

  const hasWrapperShape = 'savedAt' in parsed || 'payload' in parsed
  if (!hasWrapperShape) {
    return { status: 'expired' }
  }

  const { savedAt, payload } = parsed
  const savedAtValid = typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt > 0 && savedAt <= Date.now()
  const payloadValid = !!payload && typeof payload === 'object' && !Array.isArray(payload)
  if (!savedAtValid || !payloadValid) {
    return { status: 'invalid' }
  }
  if (Date.now() - savedAt > PENDING_REQUEST_TTL_MS) {
    return { status: 'expired' }
  }
  return { status: 'ok', payload }
}

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
  const [pendingRequestError, setPendingRequestError] = useState(null) // status==='failed'일 때의 원문 에러 메시지
  const [pendingStatus, setPendingStatus] = useState(null) // submitPendingRequestIfAny()의 마지막 결과 status(로그인/가입 공용)
  const isSubmittingPendingRef = useRef(false)

  // 로그인 없이 조건 요청서를 작성하다가 로그인/가입하러 온 경우, 완료되자마자 그 내용을 이어서 제출
  // 반환값: { status, requestId, error }
  //   none: pending key 없음 (또는 이미 진행 중인 호출이 있어 이번 호출은 조용히 무시함)
  //   success: 제출 성공, key 삭제 완료
  //   failed: 파싱은 성공했지만 DB/네트워크/예외로 실패, key 유지
  //   session_required: SESSION_REQUIRED_ERROR와 정확히 일치, key 유지
  //   invalid: JSON.parse 실패 또는 wrapper 구조 손상, key 삭제
  //   expired: savedAt 기준 TTL 초과(또는 래퍼 도입 이전 legacy 포맷), createRequest 호출 없이 key 삭제
  async function submitPendingRequestIfAny() {
    const raw = localStorage.getItem(PENDING_REQUEST_KEY)
    if (!raw) return { status: 'none', requestId: null, error: null }

    if (isSubmittingPendingRef.current) {
      // 이미 진행 중인 호출이 있음 - 새로 제출을 시도하지 않고 조용히 무시(별도 에러 표시 없음).
      // 원래 진행 중이던 호출이 끝나면 그 결과가 정상적으로 반영된다.
      return { status: 'none', requestId: null, error: null }
    }

    const classification = classifyStoredPending(raw)

    if (classification.status === 'invalid') {
      console.warn('[pending-submit] invalid/corrupted payload, discarding')
      localStorage.removeItem(PENDING_REQUEST_KEY)
      return { status: 'invalid', requestId: null, error: null }
    }
    if (classification.status === 'expired') {
      console.warn('[pending-submit] expired, discarding without submit')
      localStorage.removeItem(PENDING_REQUEST_KEY)
      return { status: 'expired', requestId: null, error: null }
    }

    const { payload } = classification

    isSubmittingPendingRef.current = true
    try {
      console.log('[pending-submit] starting', {
        dealType: payload?.dealType,
        propertyCategory: payload?.propertyCategory,
        depositMin: payload?.depositMin,
        depositMax: payload?.depositMax,
        rentMax: payload?.rentMax,
        jeonseLoanPlanned: payload?.jeonseLoanPlanned,
        roomTypeCount: payload?.roomTypes?.length ?? 0,
        hasMoveInDate: Boolean(payload?.moveInDate),
      })
      console.log('[pending-submit] calling createRequest')
      const { data, error } = await createRequest(payload)
      console.log('[pending-submit] createRequest returned', {
        hasData: Boolean(data),
        hasError: Boolean(error),
        id: data?.id ?? null,
      })

      if (error === SESSION_REQUIRED_ERROR) {
        console.error('[pending-submit] session required:', { error })
        setPendingRequestError(error)
        return { status: 'session_required', requestId: null, error }
      }
      if (error) {
        // createRequest()는 이미 toFriendlyError()를 거친 문자열을 반환하므로
        // (원본 Supabase error.code/details/hint는 requests.api.js 안에서 이미 버려짐)
        // 여기서는 그 문자열 자체를 출력한다.
        console.error('[pending-submit] createRequest failed:', { error })
        setPendingRequestError(error)
        return { status: 'failed', requestId: null, error }
      }

      // 성공했을 때만 key를 지운다 - 실패 시에는 위에서 return하므로 이 줄에 도달하지 않는다
      localStorage.removeItem(PENDING_REQUEST_KEY)
      console.log('[pending-submit] success', { id: data.id })
      return { status: 'success', requestId: data.id, error: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[pending-submit] unexpected exception:', {
        message,
        stack: err instanceof Error ? err.stack : undefined,
      })
      setPendingRequestError(message)
      return { status: 'failed', requestId: null, error: message }
    } finally {
      isSubmittingPendingRef.current = false
    }
  }

  // 로그인/가입 성공 직후 pending 제출까지 마무리하는 공통 지점(finishAfterAuth) -
  // handleFinish의 두 경로(finalizeMode/일반 가입)가 동일하게 재사용한다.
  async function finishAfterAuth() {
    const result = await submitPendingRequestIfAny()
    if (result.status === 'success') {
      // replace: 완료 화면에서 뒤로가기를 눌러도 가입 화면이 다시 나타나지 않도록 함
      navigate(`/request/success/${result.requestId}`, { replace: true })
      return
    }
    if (result.status !== 'none') {
      setPendingStatus(result.status)
    }
    setDone(true)
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
    setPendingStatus(null)
    setLoading(true)
    const { error: loginError } = await signInWithEmail({ email: email.trim(), password })
    if (loginError) { setLoading(false); setError(loginError); return }

    const { data: profile } = await getCurrentProfile()
    const result = await submitPendingRequestIfAny()
    setLoading(false)

    if (result.status === 'success') {
      // replace: 완료 화면에서 뒤로가기를 눌러도 로그인 화면이 다시 나타나지 않도록 함
      navigate(`/request/success/${result.requestId}`, { replace: true })
      return
    }
    if (result.status !== 'none') {
      // failed/session_required/invalid/expired 전부 - 이 화면에 머물러 안내한다(redirectForRole 생략)
      setPendingStatus(result.status)
      return
    }
    redirectForRole(navigate, profile?.role)
  }

  async function handleFinish() {
    setError(null)
    setLoading(true)

    if (finalizeMode) {
      const { error } = await updateOwnProfile({ nickname: nickTrimmed, preferredLanguage: lang })
      setLoading(false)
      if (error) { setError(error); return }
      await finishAfterAuth()
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
      await finishAfterAuth()
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
