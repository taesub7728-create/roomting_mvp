import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { getCurrentProfile } from '../api/auth.api'

// 고객용 화면 묶음(랜딩/요청서/마이페이지/지도/상세/채팅)의 진입점을 감싸는 가드.
// 로그인 시점의 redirectForRole만으로는 admin이 직접 URL 입력이나 뒤로가기로
// 이 라우트들에 들어오는 걸 못 막아서, 라우트 진입마다 별도로 확인해야 함
export default function CustomerRouteGuard() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: profile } = await getCurrentProfile()
      if (!cancelled && profile?.role === 'admin') navigate('/admin', { replace: true })
    }
    check()
    return () => { cancelled = true }
  }, [navigate])

  return <Outlet />
}
