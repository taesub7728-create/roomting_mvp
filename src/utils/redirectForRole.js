// 로그인 성공 후 profiles.role에 따라 알맞은 화면으로 보냄
// realtor/care_agent/pending_realtor -> 파트너 대시보드(대기중이면 대시보드가 자체적으로 심사중 화면을 보여줌)
// admin -> 운영자 화면, 그 외(customer 등) -> 홈
export function redirectForRole(navigate, role) {
  if (role === 'realtor' || role === 'care_agent' || role === 'pending_realtor') navigate('/realtor')
  else if (role === 'admin') navigate('/admin')
  else navigate('/')
}
