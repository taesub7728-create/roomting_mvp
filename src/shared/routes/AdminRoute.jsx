import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { signOut } from '../../api/auth.api'
import ProfileMissingError from './ProfileMissingError'

// signOut()이 실패하거나 onAuthStateChange가 예상만큼 빨리 안 오는 경우를 대비한 안전장치.
// 이 시간이 지나도 AuthProvider의 user/profile이 null로 반영되지 않으면 강제로 리다이렉트한다.
const SIGNOUT_TIMEOUT_MS = 5000

export default function AdminRoute() {
  const { user, profile, authLoading, profileLoading } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [forceRedirect, setForceRedirect] = useState(false)
  const timeoutRef = useRef(null)

  // "signOut() 이 아니면" role이 admin이 아닌 로그인 사용자를 감지하면 로그아웃을 시작한다.
  // 이 시점에는 화면을 아직 바꾸지 않는다 - isSigningOut===true인 동안은 아래에서 계속 null을 렌더한다.
  useEffect(() => {
    if (authLoading || profileLoading) return
    if (user && profile?.role !== 'admin' && !isSigningOut && !forceRedirect) {
      setIsSigningOut(true)
      signOut()
      timeoutRef.current = setTimeout(() => setForceRedirect(true), SIGNOUT_TIMEOUT_MS)
    }
  }, [authLoading, profileLoading, user, profile, isSigningOut, forceRedirect])

  // "signOut() 요청이 끝났다"가 아니라 "AuthProvider의 user/profile이 실제로 null이 됐다"를
  // 로그아웃 완료 기준으로 삼는다 (onAuthStateChange의 SIGNED_OUT 이벤트가 반영된 시점).
  useEffect(() => {
    if (isSigningOut && !user && !profile) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setIsSigningOut(false)
    }
  }, [isSigningOut, user, profile])

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  // 타임아웃 내에 AuthProvider 상태가 정리되지 않으면 상태 확정을 더 기다리지 않고 강제 이동
  if (forceRedirect) return <Navigate to="/admin/login" replace />

  if (authLoading || profileLoading) return null

  // 로그아웃 처리 중에는 보호된 콘텐츠를 절대 렌더하지 않는다
  if (isSigningOut) return null

  if (!user) return <Navigate to="/admin/login" replace />

  // user는 있는데 profiles 행이 없는 비정상 상태 - 로그인 페이지로 보내지 않는다
  if (!profile) return <ProfileMissingError />

  if (profile.role === 'admin') return <Outlet />

  // role이 admin이 아님 - 위 useEffect가 signOut을 트리거하는 아주 짧은 순간(다음 렌더에서
  // isSigningOut===true가 되기 전)에만 도달. 이 경우도 보호 콘텐츠를 보여주지 않는다.
  return null
}
