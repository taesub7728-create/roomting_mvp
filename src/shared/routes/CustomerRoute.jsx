import { Navigate, Outlet } from 'react-router-dom'
import { homePathForRole } from '../auth/homePathForRole'
import { useCustomerGuardChecks } from './useCustomerGuardChecks'
import ProfileMissingError from './ProfileMissingError'

// 인증(로그인 여부)과 권한(role 적합성)을 분리해서 처리한다:
//   - user === null 인 경우에만 로그인 페이지로 보낸다
//   - user는 있는데 role이 customer가 아닌 경우는 로그인 페이지가 아니라 그 role의 홈으로 보낸다
//
// role==='customer'라고 해서 바로 통과시키지 않는다: realtor 심사 대기 중인 신청자도 role은
// 그대로 customer이므로(RealtorRoute와 동일한 기준), 이 신청서 존재 여부까지 확인한 뒤에만
// 일반 고객 화면(Outlet)을 허용한다. 확인이 끝나기 전에는 Outlet을 렌더하지 않는다.
//
// pending/profile 체크 로직 자체는 useCustomerGuardChecks 훅으로 분리해 PublicCustomerRoute와
// 공유한다 (완전 비로그인 방문자에게는 이 체크들을 적용하지 않는 공개 라우트가 별도로 필요해졌기 때문).
export default function CustomerRoute() {
  const { user, profile, authLoading, profileLoading, checkingPending, pendingStatus } = useCustomerGuardChecks()

  if (authLoading || profileLoading) return null

  if (!user) return <Navigate to="/login" replace />

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
