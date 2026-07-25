import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { getCurrentProfile, signOut } from '../../api/auth.api'
import { listMyRequests } from '../../api/requests.api'
import { listMyFavorites } from '../../api/favorites.api'
import { getRoomTypeLabel } from '../../utils/roomTypeLabel'
import { sortedImageUrls } from '../../utils/propertyImages'
import './MyPage.css'

export default function MyPage() {
  const { lang } = useLanguage()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(undefined) // undefined = 로딩중, null = 미로그인
  const [requests, setRequests] = useState([])
  const [favorites, setFavorites] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: profileData, error: profileError } = await getCurrentProfile()
      if (profileError) { setError(profileError); setLoading(false); return }
      setProfile(profileData)

      if (profileData?.role === 'realtor') {
        navigate('/realtor', { replace: true })
        return
      }

      if (profileData) {
        const [{ data: requestData, error: listError }, { data: favoriteData, error: favoriteError }] = await Promise.all([
          listMyRequests(),
          listMyFavorites(),
        ])
        if (listError) setError(listError)
        else setRequests(requestData)
        if (favoriteError) setError(favoriteError)
        else setFavorites(favoriteData)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  if (loading) return <div className="frame"><div style={{ padding: 24 }}>불러오는 중...</div></div>

  if (!profile) {
    return (
      <div className="frame">
        <div className="mp-empty">
          로그인이 필요해요<br />
          <Link to="/login" style={{ color: 'var(--pink)', fontWeight: 700 }}>로그인하러 가기</Link>
        </div>
      </div>
    )
  }

  const openCount = requests.filter((r) => r.status === 'open').length
  const totalResponses = requests.reduce((sum, r) => sum + (r.response_count || 0), 0)

  return (
    <div className="frame">
      <div className="mp-header">
        <div className="mp-header-title">마이페이지</div>
        <button className="mp-logout" onClick={handleLogout}>로그아웃</button>
      </div>

      <div className="mp-profile-section">
        <div className="mp-profile-row">
          <div className="mp-avatar">{(profile.nickname || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div className="mp-name">{profile.nickname}</div>
            <div className="mp-sub">{profile.role === 'care_agent' ? '에이전트' : profile.role === 'admin' ? '관리자' : '고객'} 계정</div>
          </div>
        </div>

        <div className="mp-stats-row">
          <div className="mp-stat">
            <div className="mp-stat-num">{requests.length}</div>
            <div className="mp-stat-label">전체 요청</div>
          </div>
          <div className="mp-stat">
            <div className="mp-stat-num">{openCount}</div>
            <div className="mp-stat-label">진행중</div>
          </div>
          <div className="mp-stat">
            <div className="mp-stat-num">{totalResponses}</div>
            <div className="mp-stat-label">받은 응답</div>
          </div>
        </div>
      </div>

      <div className="mp-section-title">내 요청 내역</div>

      {error && <div className="rt-error-text" style={{ padding: '0 22px' }}>{error}</div>}

      <div className="mp-list">
        <Link to="/request" className="mp-new-req-btn">+ 새 조건 요청서 작성하기</Link>

        {requests.length === 0 ? (
          <div className="mp-empty">아직 작성한 요청서가 없어요</div>
        ) : (
          requests.map((r) => {
            const isOpen = r.status === 'open'
            return (
              <div className={`mp-req-card${isOpen ? ' active-req' : ''}`} key={r.id}>
                <div className="mp-req-header">
                  <div className={`mp-req-status`} style={{ color: isOpen ? '#2A9D5C' : 'var(--ink-soft)' }}>
                    <div className={`mp-status-dot${isOpen ? ' active' : ' closed'}`}></div>
                    <span>{isOpen ? '응답 대기 중' : '종료됨'}</span>
                  </div>
                  <div className="mp-req-date">{new Date(r.created_at).toLocaleDateString('ko-KR')}</div>
                </div>
                <div className="mp-req-chips">
                  <span className="mp-req-chip">📍 {r.region_text}</span>
                  {(r.room_types || []).map((rt) => (
                    <span className="mp-req-chip" key={rt}>{getRoomTypeLabel(lang, rt)}</span>
                  ))}
                </div>
                <div className={`mp-req-responses${isOpen ? '' : ' closed'}`}>
                  <span className={`mp-req-resp-count${isOpen ? '' : ' closed'}`}>응답 {r.response_count}건</span>
                  <Link className={`mp-req-resp-btn${isOpen ? '' : ' closed'}`} to={`/requests/${r.id}`}>확인하기</Link>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mp-section-title">찜한 매물</div>

      <div className="mp-list">
        {favorites.length === 0 ? (
          <div className="mp-empty">아직 찜한 매물이 없어요</div>
        ) : (
          favorites.map((f) => {
            const p = f.property
            const thumb = sortedImageUrls(p)[0]
            return (
              <Link className="mp-fav-card" to={`/property/${p.id}`} key={f.id}>
                <div className="mp-fav-thumb">
                  {thumb ? <img src={thumb} alt={p.title} /> : <Heart size={20} strokeWidth={1.5} color="#C3BCB6" />}
                </div>
                <div className="mp-fav-info">
                  <div className="mp-fav-title">{p.title}</div>
                  <div className="mp-fav-price">
                    월세 {Number(p.monthly_rent ?? 0).toLocaleString()}만원 · 보증금 {Number(p.deposit ?? 0).toLocaleString()}만원
                  </div>
                  <span className="mp-req-chip">{getRoomTypeLabel(lang, p.room_type)}</span>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
