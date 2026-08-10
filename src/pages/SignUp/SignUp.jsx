import { useCallback, useEffect, useRef, useState } from 'react'
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

  // 진행 중인 pending 제출 Promise. 여러 호출부가 이 하나를 공유해서 createRequest가 정확히
  // 1회만 나가고, 늦게 도착한 호출부도 같은 최종 status를 받는다.
  const pendingFlightRef = useRef(null)
  // pending 결과에 따른 UI·이동 결정이 이미 일어났는지. 여러 호출부가 같은 결과를 받아
  // 각자 navigate하는 것을 막는다. useRef이므로 언마운트 후 재마운트하면 false로 되돌아간다
  // (같은 세션에서 /login/customer에 다시 들어오면 결과 해석이 다시 가능해야 한다).
  const pendingResolvedRef = useRef(false)
  // 언마운트 뒤에 도착한 콜백이 화면을 이동시키지 않도록 하는 가드.
  const mountedRef = useRef(true)

  // 세션 존재 여부 판단(및 그에 따른 pending 처리)이 끝나기 전에는 로그인/가입 폼을 그리지
  // 않는다 - 판단 도중 폼이 잠깐 보였다 사라지는 깜빡임을 막기 위함.
  const [authChecking, setAuthChecking] = useState(true)

  useEffect(() => {
    // 개발 환경 StrictMode는 effect를 정리한 뒤 다시 실행한다. 본문에서 true로 되돌리지 않으면
    // 첫 정리 이후 계속 false로 남아 실제 마운트 상태인데도 콜백이 전부 무시된다.
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 실제 제출 본문. 재진입 판단은 하지 않는다 - 그건 submitPendingRequestIfAny()가 담당한다.
  async function runPendingSubmit(raw) {
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

    // ★ 역을 고르지 않은 요청서는 자동 제출하지 않는다(2026-08-10).
    //
    //   자동완성 도입 이전에 저장된 pending payload 에는 stationId 키가 아예 없다.
    //   그대로 제출하면 station_id 없는 요청서가 되어 029 라우팅에서 조용히 탈락한다.
    //
    //   ★ regionText 문자열로 station 을 추정하지 않는다. "신촌" 하나만 봐도 2호선과
    //     경의중앙선 두 역이 있고, 어느 쪽을 의도했는지는 사용자만 안다.
    //
    //   editable 로 돌려보내면 기존 "요청서 수정" 흐름이 그대로 재사용된다 - 복원본을
    //   저장하고 마법사로 보내 사용자가 직접 고르게 한다. pending key 는 유지된다.
    if (!payload?.stationId) {
      console.warn('[pending-submit] station not selected, routing to edit instead of submitting')
      return { status: 'editable', requestId: null }
    }

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
    }
  }

  // 로그인 없이 조건 요청서를 작성하다가 로그인/가입하러 온 경우, 완료되자마자 그 내용을 이어서 제출.
  //
  // 반환값: { status, requestId }
  //   none: PENDING_REQUEST_KEY가 실제로 없을 때만. 이 값을 받은 호출부만 평소 흐름(redirectForRole)으로 간다
  //   success: 제출 성공, key 삭제 완료
  //   retryable/editable/unknown: classifySubmitFailure() 분류 결과, key 유지(성공 후에만 삭제)
  //   session_required: SESSION_REQUIRED_ERROR와 정확히 일치, key 유지
  //   invalid: JSON.parse 실패 또는 wrapper 구조 손상, key 삭제
  //   expired: savedAt 기준 TTL 초과(또는 래퍼 도입 이전 legacy 포맷), createRequest 호출 없이 key 삭제
  //
  // single-flight: 이미 진행 중인 제출이 있으면 새로 만들지 않고 그 Promise를 그대로 돌려준다.
  // 이렇게 하면 늦게 도착한 호출부도 "진행 중"이라는 반쪽 정보가 아니라 같은 최종 status를 받는다.
  //
  // 이전 구현은 진행 중일 때 'none'을 돌려줬는데, 'none'은 "pending 없음"과 뜻이 겹쳐서
  // 받는 쪽이 redirectForRole()을 실행해버렸다(실제로 로그인 직후 editable 안내가 홈으로
  // 덮이는 버그가 났다). 재진입 여부를 호출부가 알 필요 없게 만드는 것이 이 구조의 핵심이다.
  //
  // 사용자 화면에는 DB 원본 메시지를 노출하지 않는다(분류된 status만 반환) - 원본은
  // console.error에만 남긴다. payload 전체나 extraNote 등 자유 입력 필드는 로그에 포함하지 않는다.
  function submitPendingRequestIfAny() {
    // 진행 중 확인이 키 확인보다 먼저다. 순서를 바꾸면, 진행 중인 제출이 성공하며 키를 지운
    // 직후에 도착한 호출부가 'none'을 받아 성공 화면 위로 redirect해버린다.
    if (pendingFlightRef.current) return pendingFlightRef.current

    const raw = localStorage.getItem(PENDING_REQUEST_KEY)
    if (!raw) return Promise.resolve({ status: 'none', requestId: null })

    // .finally()가 새 Promise를 만들기 때문에, 저장해둔 것과 같은 참조일 때만 해제한다
    // (다음 제출이 이미 시작됐는데 이전 제출의 정리가 그것을 지워버리는 것을 막는다).
    let flight
    flight = runPendingSubmit(raw).finally(() => {
      if (pendingFlightRef.current === flight) pendingFlightRef.current = null
    })
    pendingFlightRef.current = flight
    return flight
  }

  // pending 제출 결과에 따른 UI·이동을 결정하는 유일한 지점.
  //
  // single-flight로 여러 호출부가 같은 결과를 공유받으므로, 각자 navigate하면 다시 경쟁이 된다.
  // 최종 결정은 여기서 한 번만 일어나게 막는다.
  //
  // 반환값: 이 함수가 결과를 처리했으면(= 화면 상태나 이동을 결정했으면) true.
  // 호출부가 자기 후속 동작(setDone 등)을 할지 판단하는 데 쓴다.
  //
  // force: 사용자가 직접 누른 "다시 시도"에만 쓴다. 자동 경로가 이미 한 번 결정했다는 이유로
  // 사용자의 명시적 재시도 결과까지 무시하면 안 되기 때문이다.
  // useCallback: 아래 두 effect의 의존성에 들어가므로 렌더마다 새로 만들어지면 effect가
  // 매 렌더 재실행된다. 참조하는 값이 navigate와 ref들(안정적)뿐이라 [navigate]로 충분하다.
  const handlePendingResult = useCallback((result, { onNoPending, force = false } = {}) => {
    if (!mountedRef.current) return true // 언마운트된 뒤의 stale 콜백은 아무것도 하지 않는다
    if (!force && pendingResolvedRef.current) return true

    pendingResolvedRef.current = true

    if (result.status === 'none') {
      // PENDING_REQUEST_KEY가 실제로 없는 경우에만 여기 온다 - 각 호출부의 평소 흐름으로 넘긴다.
      onNoPending?.()
      return false
    }

    if (result.status === 'success') {
      // replace: 완료 화면에서 뒤로가기를 눌러도 로그인/가입 화면이 다시 나타나지 않도록 함
      navigate(`/request/success/${result.requestId}`, { replace: true })
      return true
    }

    setPendingStatus(result.status)
    setAuthChecking(false)
    return true
  }, [navigate])

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

    // 복귀 단계: 사용자가 실제로 고쳐야 하는 단계로 보낸다.
    // review로 직행시키지 않는다 - 단계 validate()를 건너뛰어 검증 공백이 재현된다.
    //
    // 역 미선택으로 돌아온 경우는 location 단계다(자동완성에서 다시 고르면 된다).
    // 그 외 editable로 분류되는 constraint는 둘 다 거래조건 단계 항목이라 transaction이다.
    const returnStep = form.stationId == null ? 'location' : 'transaction'
    const saved = saveRestoredDraft({
      form,
      currentStep: getStepIndex('residential', returnStep),
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
    // 가입 완료 흐름에서는 pending이 없어도 완료 오버레이를 띄워야 하므로 onNoPending은 비운다.
    const handled = handlePendingResult(result)
    // success면 이미 상세 화면으로 이동했다 - 그 위에 완료 오버레이를 겹치지 않는다.
    if (handled && result.status === 'success') return
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
        // 중복 createRequest는 single-flight가, 중복 이동은 handlePendingResult가 막는다 -
        // 진입 자체를 막는 별도 가드는 두지 않는다.
        const result = await submitPendingRequestIfAny()
        handlePendingResult(result, {
          onNoPending: () => redirectForRole(navigate, profile.role),
        })
        return
      }
      // 닉네임이 없으면 소셜 가입 직후 처음 들어온 것 → 닉네임만 채우면 가입 완료
      setFinalizeMode(true)
      setStep(1)
      setAuthChecking(false)
    }
    checkExistingSession()
  }, [navigate, handlePendingResult])

  // mode==='login' 전용: 이미 로그인 + profile까지 확정된 사용자를 redirect하기 전에 pending
  // 제출을 먼저 처리한다(기존에는 동기 <Navigate>가 이 확인 없이 즉시 이동시켰음).
  useEffect(() => {
    if (mode !== 'login') return
    if (authLoading || profileLoading) return
    if (!user || !profile) return

    let cancelled = false
    async function resolveLoginModeSession() {
      // handleLogin()이 이미 제출을 시작했다면 여기서 새로 만들지 않고 그 결과를 그대로 받는다.
      const result = await submitPendingRequestIfAny()
      if (cancelled) return
      handlePendingResult(result, {
        onNoPending: () => redirectForRole(navigate, profile.role),
      })
    }
    resolveLoginModeSession()
    return () => { cancelled = true }
  }, [mode, user, profile, authLoading, profileLoading, navigate, handlePendingResult])

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
    // 로그인 성공으로 user/profile이 갱신되면 mode==='login' effect도 함께 깨어난다.
    // 둘 중 누가 먼저 오든 같은 flight를 공유하고, 결과 해석은 handlePendingResult가 한 번만 한다.
    const result = await submitPendingRequestIfAny()
    setLoading(false)
    handlePendingResult(result, {
      onNoPending: () => redirectForRole(navigate, profile?.role),
    })
  }

  // pending 제출 실패 후 "다시 시도" 버튼 - 재로그인 없이 동일한 함수를 그대로 재호출한다.
  async function handleRetryPendingSubmit() {
    setIsRetryingPending(true)
    const result = await submitPendingRequestIfAny()
    setIsRetryingPending(false)

    // force: 자동 경로가 이미 결과를 한 번 해석했더라도, 사용자가 직접 누른 재시도의 결과는
    // 반드시 화면에 반영해야 한다. onNoPending은 두지 않는다 - 이 화면에 머무는 것이 맞고,
    // 재시도 결과로 사용자를 홈으로 보내지 않는다.
    handlePendingResult(result, { force: true })
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
        {/* 가입 유도·로그인 유형 재선택도 "인증 진입 UI"의 일부다. 위 폼·소셜 버튼과 같은
            showAuthEntry 조건으로 함께 숨긴다 - 이미 로그인을 마친 사용자에게 pending 실패를
            안내하면서 회원가입을 권하는 모순된 화면이 나오던 것을 막는다.
            session_required는 showAuthEntry가 true로 유지되므로 이 링크들도 계속 보인다. */}
        {showAuthEntry && mode === 'login' && step === 0 && (
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
