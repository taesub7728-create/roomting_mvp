import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { hasSeenOnboarding, isOnboardingEligibleRole, findLatestOpenRequest } from './onboardingEntry'
import Splash from '../../components/Splash'

// Splash를 "고정 타이머"가 아니라 "준비 상태 + 최소 노출 시간"으로 제어한다.
// 빠른 기기: 준비가 MIN_VISIBLE_MS 전에 끝나도 그때까지는 계속 보여준다.
// 느린 기기: MIN_VISIBLE_MS가 지나도 준비가 안 끝났으면 준비될 때까지 유지한다.
const MIN_VISIBLE_MS = 600
// Splash가 내려갈 때의 페이드아웃 길이. 이미 안정된 화면 위에서 잠깐 사라지는 연출일 뿐이라
// 아래 Routes의 렌더/네비게이션을 지연시키지 않는다 (Routes는 Splash 아래 항상 마운트돼 있음).
const FADE_OUT_MS = 250

// Splash 이후 진입 분기 + Onboarding 완료 상태를 실제로 연결하는 자리.
// pathname이 '/'일 때만 아래 우선순위로 분기하고, 그 외 경로(딥링크)는 원래 라우트를 그대로 둔다.
//   1) 로그인 customer/pending_realtor + 최신 open 요청서 존재 → /requests/:requestId
//   2) 그 외이면서 온보딩 미완료 → /onboarding
//   3) 그 외 → '/' 유지
export default function AppEntryGate({ children }) {
  const { user, profile, authLoading, profileLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [openCheck, setOpenCheck] = useState({ done: false, request: null })
  const [splashMounted, setSplashMounted] = useState(true)
  const [fadingOut, setFadingOut] = useState(false)
  const fetchTokenRef = useRef(0)
  const hasRoutedRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [])

  // open 요청서 조회는 앱 최초 진입 판단에 필요한 1회 조회로 제한한다 - user.id/role이 실제로
  // 바뀔 때만 다시 판단하고, 리렌더나 언어 변경만으로는 재조회하지 않는다. token은 StrictMode의
  // effect 2회 실행이나 로그아웃 직후 이전 user의 응답이 늦게 도착하는 경우를 무시하기 위함이다.
  useEffect(() => {
    if (authLoading || profileLoading) return

    const eligible = !!user?.id && isOnboardingEligibleRole(profile?.role)
    if (!eligible) {
      setOpenCheck({ done: true, request: null })
      return
    }

    const token = ++fetchTokenRef.current
    let cancelled = false
    findLatestOpenRequest().then((request) => {
      if (cancelled || token !== fetchTokenRef.current) return
      setOpenCheck({ done: true, request })
    })
    return () => { cancelled = true }
  }, [authLoading, profileLoading, user?.id, profile?.role])

  const dataReady = !authLoading && !profileLoading && openCheck.done
  const ready = dataReady && minTimeElapsed

  // 준비 완료 시 딱 1회만 분기를 판단한다(hasRoutedRef). navigate를 먼저 호출한 뒤에 Splash
  // 페이드를 시작해서, Splash가 걷히는 시점에는 이미 목적지 라우트로 바뀌어 있게 한다 -
  // 그래야 원래 '/'(Landing)가 한 프레임이라도 보이는 flicker가 생기지 않는다.
  useEffect(() => {
    if (!ready || hasRoutedRef.current) return
    hasRoutedRef.current = true

    if (location.pathname === '/') {
      // 로그인은 했지만 customer/pending_realtor가 아닌 사용자(realtor/admin/care_agent)에게는
      // 온보딩도, open 요청서 직행도 적용하지 않는다 - PublicCustomerRoute가 이미 각자의
      // 홈으로 리다이렉트하므로 여기서는 그 흐름을 건드리지 않고 그대로 둔다.
      const isLoggedInNonCustomer = !!user && !isOnboardingEligibleRole(profile?.role)
      if (!isLoggedInNonCustomer) {
        if (openCheck.request) {
          navigate(`/requests/${openCheck.request.id}`, { replace: true })
        } else if (!hasSeenOnboarding()) {
          navigate('/onboarding', { replace: true })
        }
      }
    }

    setFadingOut(true)
    const timer = setTimeout(() => setSplashMounted(false), FADE_OUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <>
      {splashMounted && <Splash fadingOut={fadingOut} />}
      {children}
    </>
  )
}
