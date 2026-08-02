import { useIsDesktop } from '../../hooks/useIsDesktop'
import Landing from '../Landing/Landing'
import CustomerHome from './CustomerHome'

// '/'의 실제 element. 뷰포트 폭만으로 분기한다 - 로그인 여부/role 판단은 여기서 중복하지 않는다.
// (PublicCustomerRoute가 이미 비-customer 로그인 사용자와 심사 대기자를 여기 도달하기 전에
// 걸러내므로, 이 컴포넌트에 도달하는 시점엔 "완전 비로그인" 또는 "확정된 customer" 둘 중 하나뿐이다.
// role 분기를 이 안에도 넣으면 가드가 두 군데가 되어 나중에 한쪽만 고쳐 어긋날 수 있다.)
//
// 1024px 미만: 로그인 여부와 무관하게 CustomerHome(비로그인은 내부에서 no_request로 렌더).
// 1024px 이상: 로그인 여부와 무관하게 기존 Landing 유지 - 모바일 전체 플로우 완성 전까지의
// 임시 정책이다(TODO_PHASE2.md 참고).
export default function HomeRoute() {
  const isDesktop = useIsDesktop(1024)
  return isDesktop ? <Landing /> : <CustomerHome />
}
