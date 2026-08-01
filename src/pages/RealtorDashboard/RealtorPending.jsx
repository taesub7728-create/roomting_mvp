import { Navigate } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import { useSignOutFlow } from '../../shared/auth/useSignOutFlow'
import './RealtorDashboard.css'

// RealtorRoute가 "심사 대기 중"으로 판단한 사용자를 여기로 리다이렉트한다.
// (RealtorDashboard.jsx 내부에 있던 동일한 안내 화면을 이 전용 라우트로 분리한 것 - 로직 변경 없음)
export default function RealtorPending() {
  const { isSigningOut, done, startSignOut } = useSignOutFlow()

  // AuthProvider의 user/profile이 실제로 null로 반영된 뒤에만 이동한다(렌더 단계에서 즉시 결정)
  if (done) return <Navigate to="/login" replace />

  if (isSigningOut) {
    return (
      <div className="frame">
        <div className="rd-guard">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="frame">
      <div className="rd-guard">
        <Hourglass size={32} strokeWidth={1.75} />
        <p style={{ fontWeight: 700 }}>아직 심사 중이에요</p>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>승인되면 안내드릴게요. 조금만 기다려주세요</p>
        <button
          className="mp-logout"
          style={{ background: 'none', border: 'none', color: 'var(--coral)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginTop: 8 }}
          onClick={startSignOut}
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}
