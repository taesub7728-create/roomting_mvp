import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentProfile } from '../../api/auth.api'
import { listOpenRequests } from '../../api/requests.api'
import { roomTypeLabels } from './roomTypeLabels'
import './RealtorDashboard.css'

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

export default function RealtorDashboard() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(undefined) // undefined = 로딩중, null = 미로그인
  const [requests, setRequests] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: profileData, error: profileError } = await getCurrentProfile()
      if (profileError) { setError(profileError); setLoading(false); return }
      setProfile(profileData)

      if (profileData?.role === 'realtor') {
        const { data, error: listError } = await listOpenRequests()
        if (listError) setError(listError)
        else setRequests(data)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="frame"><div className="rd-guard">불러오는 중...</div></div>
  }

  if (!profile || profile.role !== 'realtor') {
    return (
      <div className="frame">
        <div className="rd-guard">
          <div style={{ fontSize: 32 }}>🔒</div>
          <p style={{ fontWeight: 700 }}>공인중개사 계정으로 로그인해야 볼 수 있는 화면이에요</p>
          <Link to="/" style={{ color: 'var(--pink)', fontWeight: 700 }}>홈으로 돌아가기</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="frame">
      <div className="rd-header">
        <div className="rd-title">고객 요청 목록</div>
      </div>

      {error && <div className="rt-error-text" style={{ padding: '0 20px' }}>{error}</div>}

      {requests.length === 0 ? (
        <div className="rd-empty">아직 열려있는 요청서가 없어요</div>
      ) : (
        <div className="rd-list">
          {requests.map((r) => (
            <div key={r.id} className="rd-card" onClick={() => navigate(`/realtor/respond/${r.id}`)}>
              <div className="rd-card-top">
                <span className="rd-region">{r.region_text}</span>
                <span className="rd-time">{timeAgo(r.created_at)}</span>
              </div>
              <div className="rd-budget">
                보증금 {Number(r.deposit_max ?? 0).toLocaleString()}만원 / 월세 {r.rent_max ?? 0}만원
              </div>
              <div className="rd-tags">
                {(r.room_types || []).map((rt) => (
                  <span className="rd-tag" key={rt}>{roomTypeLabels[rt] || rt}</span>
                ))}
                {r.registration_required && <span className="rd-tag neutral">전입신고 필요</span>}
                {r.move_in_date && <span className="rd-tag neutral">입주 {r.move_in_date}</span>}
              </div>
              {r.extra_note && <div className="rd-note">{r.extra_note}</div>}
              <div className="rd-footer">
                <span>계약 {r.contract_months ?? '-'}개월</span>
                <span className="rd-response-count">응답 {r.response_count}건</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
