import { Link } from 'react-router-dom'
import { Construction } from 'lucide-react'

// 아직 구현되지 않은 화면(조건 요청서, 지도 탐색 등)으로 이동했을 때 보여주는 임시 화면
export default function ComingSoon() {
  return (
    <div className="frame" style={{ alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 16 }}>
      <Construction size={40} strokeWidth={1.75} />
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>이 화면은 아직 준비 중이에요</p>
      <Link to="/" style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 14 }}>홈으로 돌아가기</Link>
    </div>
  )
}
