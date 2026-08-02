import { useAuth } from '../../shared/auth/useAuth'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import Landing from '../Landing/Landing'
import CustomerHome from './CustomerHome'

// '/'의 실제 element. PublicCustomerRoute가 이미 로그인 사용자의 role/심사 상태를 걸러준
// 뒤라서(비customer는 각자 홈으로, 심사 대기는 /realtor/pending으로 리다이렉트됨), 여기 도달하는
// 시점엔 항상 "완전 비로그인" 또는 "확정된 customer" 둘 중 하나다.
//
// 모바일 전체 플로우가 완성되기 전까지는 데스크톱(1024px~)에서 로그인 customer도 Landing을
// 그대로 유지한다 - CustomerHome은 모바일 전용으로 설계된 콘텐츠라 넓은 화면에서 그대로 늘리면
// 어색하다. 데스크톱 대응은 홈 화면 재설계 때 함께 다룬다(TODO_PHASE2.md 참고).
export default function HomeRoute() {
  const { user, profile } = useAuth()
  const isDesktop = useIsDesktop(1024)
  const showCustomerHome = !!user && profile?.role === 'customer' && !isDesktop
  return showCustomerHome ? <CustomerHome /> : <Landing />
}
