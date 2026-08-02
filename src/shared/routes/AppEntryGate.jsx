import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import Splash from '../../components/Splash'

// Splash를 "고정 타이머"가 아니라 "준비 상태 + 최소 노출 시간"으로 제어한다.
// 빠른 기기: 준비가 MIN_VISIBLE_MS 전에 끝나도 그때까지는 계속 보여준다.
// 느린 기기: MIN_VISIBLE_MS가 지나도 준비가 안 끝났으면 준비될 때까지 유지한다.
const MIN_VISIBLE_MS = 600
// Splash가 내려갈 때의 페이드아웃 길이. 이미 안정된 화면 위에서 잠깐 사라지는 연출일 뿐이라
// 아래 Routes의 렌더/네비게이션을 지연시키지 않는다 (Routes는 Splash 아래 항상 마운트돼 있음).
const FADE_OUT_MS = 250

// 이후 커밋(2, 3)에서 Onboarding 진입 여부와 open 요청서 직행 분기가 이 자리에 추가될 예정.
// 이번 커밋에서는 "준비 상태 판정 + Splash 노출/해제"까지만 구현한다 - 분기가 아직 없으므로
// Splash가 내려가면 현재 pathname의 라우트가 그대로 보인다(딥링크도 자연히 유지됨).
export default function AppEntryGate({ children }) {
  const { authLoading, profileLoading } = useAuth()
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [splashMounted, setSplashMounted] = useState(true)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [])

  const dataReady = !authLoading && !profileLoading
  const ready = dataReady && minTimeElapsed

  useEffect(() => {
    if (!ready || fadingOut || !splashMounted) return
    setFadingOut(true)
    const timer = setTimeout(() => setSplashMounted(false), FADE_OUT_MS)
    return () => clearTimeout(timer)
  }, [ready, fadingOut, splashMounted])

  return (
    <>
      {splashMounted && <Splash fadingOut={fadingOut} />}
      {children}
    </>
  )
}
