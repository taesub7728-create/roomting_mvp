import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { signUpWithEmail, signInWithEmail, signInWithOAuth, updateOwnProfile, getSession, getCurrentProfile } from '../../api/auth.api'
import { createRequest, SESSION_REQUIRED_ERROR } from '../../api/requests.api'
import { classifySubmitFailure } from '../../api/classifySubmitFailure'
import { PENDING_REQUEST_KEY, PENDING_REQUEST_TTL_MS } from '../RequestWizard/RequestWizard'
import { restoreRequestForm } from '../RequestWizard/restoreRequestForm'
import { saveRestoredDraft } from '../RequestWizard/requestDraftStorage'
import { getStepIndex } from '../RequestWizard/steps'
import { redirectForRole } from '../../utils/redirectForRole'
import { useAuth } from '../../shared/auth/useAuth'
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
  // savedAt("제출 버튼을 누른 시각")도 함께 돌려준다 - 요청서 수정 흐름에서 마법사의 기존
  // draft와 어느 쪽이 사용자의 최신 의도인지 비교하는 기준이 된다.
  return { status: 'ok', payload, savedAt }
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
  const [pendingStatus, setPendingStatus] = useState(null) // submitPendingRequestIfAny()의 마지막 결과 status(로그인/가입 공용)
  const [isRetryingPending, setIsRetryingPending] = useState(false)
  const isSubmittingPendingRef = useRef(false)

  // 세션 존재 여부 판단(및 그에 따른 pending 처리)이 끝나기 전에는 로그인/가입 폼을 그리지
  // 않는다 - 판단 도중 폼이 잠깐 보였다 사라지는 깜빡임을 막기 위함.
  const [authChecking, setAuthChecking] = useState(true)
  // checkExistingSession(모든 mode에서 실행)과 mode==='login' 전용 effect가 같은 마운트에서
  // 동시에 "이미 로그인된 사용자"를 감지했을 때 pending 제출을 두 번 트리거하지 않기 위한 가드.
  const postAuthResolvedRef = useRef(false)

  // 로그인 없이 조건 요청서를 작성하다가 로그인/가입하러 온 경우, 완료되자마자 그 내용을 이어서 제출
  // 반환값: { status, requestId }
  //   none: pending key 없음 (또는 이미 진행 중인 호출이 있어 이번 호출은 조용히 무시함)
  //   success: 제출 성공, key 삭제 완료
  //   retryable/editable/unknown: classifySubmitFailure() 분류 결과, key 유지(성공 후에만 삭제)
  //   session_required: SESSION_REQUIRED_ERROR와 정확히 일치, key 유지
  //   invalid: JSON.parse 실패 또는 wrapper 구조 손상, key 삭제
  //   expired: savedAt 기준 TTL 초과(또는 래퍼 도입 이전 legacy 포맷), createRequest 호출 없이 key 삭제
  //
  // 사용자 화면에는 DB 원본 메시지를 노출하지 않는다(분류된 status만 반환) - 원본은 아래
  // console.error에만 남긴다. payload 전체나 extraNote 등 자유 입력 필드는 로그에 포함하지 않는다.
  async function submitPendingRequestIfAny() {
    const raw = localStorage.getItem(PENDING_REQUEST_KEY)
    if (!raw) return { status: 'none', requestId: null }

    if (isSubmittingPendingRef.current) {
      // 이미 진행 중인 호출이 있음 - 새로 제출을 시도하지 않고 조용히 무시(별도 에러 표시 없음).
      // 원래 진행 중이던 호출이 끝나면 그 결과가 정상적으로 반영된다.
      return { status: 'none', requestId: null }
    }

    const classification = classifyStoredPending(raw)

    if (classification.status === 'invalid') {
      console.warn('[pending-submit] invalid/corrupted payload, discarding')
      localStorage.removeItem(PENDING_REQUEST_KEY)
      return { status: 'invalid', requestId: null }
    }
    if (classification.status === 'expired') {
      console.warn('[pending-submit] expired, discarding without submit')
      localStorage.removeItem(PENDING_REQUEST_KEY)
      return { status: 'expired', requestId: null }
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
      const { data, error, rawError } = await createRequest(payload)
      console.log('[pending-submit] createRequest returned', {
        hasData: Boolean(data),
        hasError: Boolean(error),
        id: data?.id ?? null,
      })

      if (error === SESSION_REQUIRED_ERROR) {
        console.error('[pending-submit] session required')
        return { status: 'session_required', requestId: null }
      }
      if (error) {
        // 화면엔 절대 노출하지 않음 - code/message/details/hint만 콘솔에 남긴다(payload는 제외).
        console.error('[pending-submit] createRequest failed:', {
          code: rawError?.code,
          message: rawError?.message,
          details: rawError?.details,
          hint: rawError?.hint,
        })
        return { status: classifySubmitFailure(rawError), requestId: null }
      }

      // 성공했을 때만 key를 지운다 - 실패 시에는 위에서 return하므로 이 줄에 도달하지 않는다
      localStorage.removeItem(PENDING_REQUEST_KEY)
      console.log('[pending-submit] success', { id: data.id })
      return { status: 'success', requestId: data.id }
    } catch (err) {
      console.error('[pending-submit] unexpected exception:', {
        message: err instanceof Error ? err.message : String(err),
      })
      return { status: classifySubmitFailure(err), requestId: null }
    } finally {
      isSubmittingPendingRef.current = false
    }
  }

  // 로그인/가입 성공 직후 pending 제출까지 마무리하는 공통 지점(finishAfterAuth) -
  // handleFinish의 두 경로(finalizeMode/일반 가입)가 동일하게 재사용한다.
  // editable 실패 - "요청서 수정" 진입점.
  //
  // 저장 순서가 이 함수의 핵심이다: 복원본 저장이 성공한 것을 확인한 뒤에만
  // PENDING_REQUEST_KEY를 지운다. 반대로 하면 저장이 실패했을 때 사용자가 입력한 내용이
  // 양쪽 모두에서 사라진다.
  //
  // 기존 draft와 어느 쪽을 살릴지는 여기서 판단하지 않는다 - 마법사가 양쪽을 모두 읽고
  // 결정한다(draft 저장 포맷을 아는 곳을 한 군데로 유지하기 위함).
  function handleEditPendingRequest() {
    const raw = localStorage.getItem(PENDING_REQUEST_KEY)
    if (!raw) {
      // 다른 탭에서 이미 처리했거나 만료된 경우 - 빈손으로 마법사에 보내지 않고 상태만 갱신한다.
      setPendingStatus('invalid')
      return
    }

    const classification = classifyStoredPending(raw)
    if (classification.status !== 'ok') {
      setPendingStatus(classification.status)
      localStorage.removeItem(PENDING_REQUEST_KEY)
      return
    }

    const { form, rentFallbackApplied } = restoreRequestForm(classification.payload)

    // 복귀 단계: editable로 분류되는 constraint는 둘 다 거래조건 단계 항목이다.
    // review로 직행시키지 않는다 - 단계 validate()를 건너뛰어 검증 공백이 재현된다.
    const saved = saveRestoredDraft({
      form,
      currentStep: getStepIndex('residential', 'transaction'),
      sourceSavedAt: classification.savedAt,
      rentFallbackApplied,
    })

    if (!saved) {
      // 저장에 실패했으면 pending을 그대로 둔다 - 아무것도 잃지 않은 상태로 남는다.
      console.error('[pending-edit] failed to persist restored draft, keeping pending key')
      setPendingStatus('unknown')
      return
    }

    localStorage.removeItem(PENDING_REQUEST_KEY)
    navigate('/request')
  }

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
      if (!session) {
        setAuthChecking(false)
        return
      }

      // 이미 닉네임까지 있는 계정이면(기존 회원) 소셜 로그인 또는 이미 로그인된 상태로 이
      // 화면에 재진입한 것 - redirect 전에 pending 제출부터 처리한다(누락 시 조용히 유실됨).
      const { data: profile } = await getCurrentProfile()
      if (profile?.nickname) {
        if (postAuthResolvedRef.current) return
        postAuthResolvedRef.current = true

        const result = await submitPendingRequestIfAny()
        if (result.status === 'success') {
          navigate(`/request/success/${result.requestId}`, { replace: true })
          return
        }
        if (result.status !== 'none') {
          setPendingStatus(result.status)
          setAuthChecking(false)
          return
        }
        redirectForRole(navigate, profile.role)
        return
      }
      // 닉네임이 없으면 소셜 가입 직후 처음 들어온 것 → 닉네임만 채우면 가입 완료
      setFinalizeMode(true)
      setStep(1)
      setAuthChecking(false)
    }
    checkExistingSession()
  }, [navigate])

  // mode==='login' 전용: 이미 로그인 + profile까지 확정된 사용자를 redirect하기 전에 pending
  // 제출을 먼저 처리한다(기존에는 동기 <Navigate>가 이 확인 없이 즉시 이동시켰음).
  useEffect(() => {
    if (mode !== 'login') return
    if (authLoading || profileLoading) return
    if (!user || !profile) return
    if (postAuthResolvedRef.current) return

    let cancelled = false
    async function resolveLoginModeSession() {
      postAuthResolvedRef.current = true
      const result = await submitPendingRequestIfAny()
      if (cancelled) return
      if (result.status === 'success') {
        navigate(`/request/success/${result.requestId}`, { replace: true })
        return
      }
      if (result.status !== 'none') {
        setPendingStatus(result.status)
        setAuthChecking(false)
        return
      }
      redirectForRole(navigate, profile.role)
    }
    resolveLoginModeSession()
    return () => { cancelled = true }
  }, [mode, user, profile, authLoading, profileLoading, navigate])

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

  // pending 제출 실패(failed) 후 "다시 시도" 버튼 - 재로그인 없이 동일한 함수를 그대로 재호출한다
  async function handleRetryPendingSubmit() {
    setIsRetryingPending(true)
    const result = await submitPendingRequestIfAny()
    setIsRetryingPending(false)

    if (result.status === 'success') {
      navigate(`/request/success/${result.requestId}`, { replace: true })
      return
    }
    if (result.status !== 'none') {
      setPendingStatus(result.status)
    }
    // result.status === 'none'(재진입 차단으로 무시된 경우)이면 화면 상태를 그대로 둔다
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

  // 세션/펜딩 판단이 끝나기 전에는 로그인/가입 폼을 그리지 않는다(mode 공통).
  // 실제 리다이렉트 여부 판단은 위 checkExistingSession effect와 mode==='login' 전용
  // effect가 담당하고, 여기서는 그 판단이 끝날 때까지 화면만 비워둔다.
  if (authChecking) return null

  // pendingStatus가 있다는 건 이미 인증이 끝난 뒤라는 뜻(checkExistingSession/login effect/
  // handleLogin 전부 인증 성공 이후에만 pendingStatus를 세팅함) - 이 상태에서 로그인/가입
  // 진입 UI(OAuth·이메일 폼)를 또 보여줄 필요가 없다. 예외는 session_required뿐 - 이 상태의
  // 안내 문구가 "위에서 다시 로그인해주세요"를 가리키므로 그 폼이 계속 보여야 의미가 통한다.
  const showAuthEntry = !pendingStatus || pendingStatus === 'session_required'

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
            {showAuthEntry && (
              <>
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
              </>
            )}

            {pendingStatus === 'retryable' && (
              <>
                <div className="slide-title">{t.pendingRetryableTitle}</div>
                <div className="rt-error-text">{t.pendingRetryableHint}</div>
                <div className="rt-error-text">{t.pendingRetryHint}</div>
                <button
                  type="button"
                  className="rt-btn-secondary"
                  disabled={isRetryingPending}
                  onClick={handleRetryPendingSubmit}
                >
                  {isRetryingPending ? t.pendingRetrying : t.pendingRetryBtn}
                </button>
              </>
            )}
            {pendingStatus === 'editable' && (
              <>
                <div className="slide-title">{t.pendingEditableTitle}</div>
                <div className="rt-error-text">{t.pendingEditableHint}</div>
                <button type="button" className="rt-btn-secondary" onClick={handleEditPendingRequest}>
                  {t.pendingEditBtn}
                </button>
              </>
            )}
            {pendingStatus === 'unknown' && (
              <>
                <div className="slide-title">{t.pendingUnknownTitle}</div>
                <div className="rt-error-text">{t.pendingUnknownHint}</div>
                <div className="rt-error-text">{t.pendingRetryHint}</div>
                <button
                  type="button"
                  className="rt-btn-secondary"
                  disabled={isRetryingPending}
                  onClick={handleRetryPendingSubmit}
                >
                  {isRetryingPending ? t.pendingRetrying : t.pendingRetryBtn}
                </button>
              </>
            )}
            {pendingStatus === 'session_required' && (
              // 오류가 아니라 안내이므로 rt-error-text(빨간 오류 박스)와 다른 스타일을 쓴다 -
              // 위쪽 로그인 폼(showAuthEntry===true라 항상 함께 보임)을 가리키는 문구라 폼과
              // 나란히 있어도 "또 다른 오류"처럼 보이지 않게 하기 위함.
              <div className="rt-notice-text">{t.pendingSessionHint}</div>
            )}
            {pendingStatus === 'invalid' && (
              <>
                <div className="slide-title">{t.pendingInvalidTitle}</div>
                <div className="rt-error-text">{t.pendingInvalidHint}</div>
                <button type="button" className="rt-btn-secondary" onClick={() => navigate('/request')}>
                  {t.pendingRewriteBtn}
                </button>
              </>
            )}
            {pendingStatus === 'expired' && (
              <>
                <div className="slide-title">{t.pendingExpiredTitle}</div>
                <div className="rt-error-text">{t.pendingExpiredHint}</div>
                <button type="button" className="rt-btn-secondary" onClick={() => navigate('/request')}>
                  {t.pendingRewriteBtn}
                </button>
              </>
            )}

            {/* showAuthEntry가 false인 모든 pending 상태 공통 이탈 경로. PENDING_REQUEST_KEY는
                건드리지 않는다 - 다시 로그인하면 checkExistingSession/login effect가 재시도한다. */}
            {!showAuthEntry && (
              <button
                type="button"
                className="rt-btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => redirectForRole(navigate, profile?.role)}
              >
                {t.pendingLeaveBtn}
              </button>
            )}
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
        {showAuthEntry && step === 0 && authMethod === 'email' && mode === 'login' && (
          <button
            className="rt-btn-primary"
            disabled={!emailValid || !passwordValid || loading}
            onClick={handleLogin}
          >
            {t.loginBtn}
          </button>
        )}
        {showAuthEntry && step === 0 && authMethod === 'email' && mode !== 'login' && (
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
          {pendingStatus === 'session_required' && <div className="rt-error-text" style={{ marginBottom: 12 }}>{t.pendingSessionHint}</div>}
          {pendingStatus === 'invalid' && <div className="rt-error-text" style={{ marginBottom: 12 }}>{t.pendingInvalidHint}</div>}
          {pendingStatus === 'expired' && <div className="rt-error-text" style={{ marginBottom: 12 }}>{t.pendingExpiredHint}</div>}
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
