import { Navigate, Outlet } from 'react-router-dom'
import { homePathForRole } from '../auth/homePathForRole'
import { useCustomerGuardChecks } from './useCustomerGuardChecks'
import ProfileMissingError from './ProfileMissingError'

// '/', '/request', '/map' 전용 공개 라우트: 완전 비로그인 방문자는 어떤 체크도 없이 즉시 통과시킨다
// (Public Entry Flow 승인안 - 비로그인 방문자에게 pending/profile 체크를 적용하지 않는다).
//
// 로그인한 사용자가 들어온 경우에만 CustomerRoute와 동일한 권한/심사 체크를 적용해서
// (customer가 아니면 자기 role 홈으로, realtor 심사 대기 중이면 /realtor/pending으로) 기존
// 로그인 사용자 흐름을 그대로 유지한다. 체크 로직 자체는 useCustomerGuardChecks로 공유한다.
export default function PublicCustomerRoute() {
  const { user, profile, authLoading, profileLoading, checkingPending, pendingStatus } = useCustomerGuardChecks()

  if (authLoading) return null

  // 완전 비로그인 방문자 - 어떤 체크도 적용하지 않고 바로 공개 화면 렌더
  if (!user) return <Outlet />

  if (profileLoading) return null

  // user는 있는데 profiles 행이 없는 비정상 상태 - 로그인 페이지로 보내지 않는다
  if (!profile) return <ProfileMissingError />

  if (profile.role !== 'customer') {
    return <Navigate to={homePathForRole(profile.role)} replace />
  }

  // 여기부터는 profile.role === 'customer' - 심사 대기 여부가 확정되기 전까지는 아무것도 렌더하지 않는다
  if (checkingPending || pendingStatus === null) return null

  if (pendingStatus === true) return <Navigate to="/realtor/pending" replace />

  return <Outlet />
}
