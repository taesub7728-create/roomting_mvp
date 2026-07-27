// role에 따른 "로그인 상태에서의 기본 홈" 경로.
// Route Guard들과 로그인 페이지들이 동일한 기준을 쓰도록 한 곳으로 모은다
// (이전 버그가 각 Guard마다 role→목적지 매핑을 따로 들고 있다가 서로 어긋나면서 생겼음).
export function homePathForRole(role) {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'realtor':
    case 'pending_realtor': // 레거시 하위호환 - 실제 pending 여부는 RealtorRoute가 다시 판단
      return '/realtor'
    case 'customer':
      return '/'
    default: // care_agent 등 아직 전용 화면이 없는 role
      return '/coming-soon'
  }
}
