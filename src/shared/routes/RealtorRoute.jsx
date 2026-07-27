import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { hasPendingRealtorApplication } from '../auth/realtorStatus'
import ProfileMissingError from './ProfileMissingError'

// 인증(로그인 여부)과 권한(role 적합성)을 분리해서 처리한다:
//   - user === null 인 경우에만 로그인 페이지로 보낸다
//   - user는 있는데 role이 realtor가 아닌 경우는 "로그인 페이지"가 아니라 그 role에 맞는 곳으로 보낸다
export default function RealtorRoute() {
  const { user, profile, authLoading, profileLoading } = useAuth()
  const [hasApplication, setHasApplication] = useState(undefined) // customer role일 때만 사용, undefined = 확인중

  const isCustomer = !authLoading && !profileLoading && profile?.role === 'customer'

  useEffect(() => {
    if (!isCustomer) { setHasApplication(undefined); return }

    let cancelled = false
    hasPendingRealtorApplication().then((result) => {
      if (!cancelled) setHasApplication(result)
    })
    return () => { cancelled = true }
  }, [isCustomer])

  if (authLoading || profileLoading) return null

  if (!user) return <Navigate to="/login/realtor" replace />

  // user는 있는데 profiles 행이 없는 비정상 상태 - 로그인 페이지로 보내지 않는다
  if (!profile) return <ProfileMissingError />

  switch (profile.role) {
    case 'realtor':
      return <Outlet />

    case 'admin':
      return <Navigate to="/admin" replace />

    case 'pending_realtor': // 이 방식(신청서 존재로 심사중 판단) 도입 이전 계정을 위한 하위호환
      return <Navigate to="/realtor/pending" replace />

    case 'customer':
      if (hasApplication === undefined) return null // 신청서 존재 여부 확인 중
      return hasApplication
        ? <Navigate to="/realtor/pending" replace />
        : <Navigate to="/" replace />

    default: // care_agent 등 아직 전용 화면이 없는 role
      return <Navigate to="/coming-soon" replace />
  }
}
