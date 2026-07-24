import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentProfile, signOut } from '../../api/auth.api'
import { listOpenRequests } from '../../api/requests.api'
import { listMyPropertyResponses } from '../../api/properties.api'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { roomTypeLabels } from './roomTypeLabels'
import './RealtorDashboard.css'

const ROOM_TYPE_FILTERS = ['one_room', 'two_room', 'goshiwon', 'share_house', 'officetel', 'apartment']

function thumbnailUrl(property) {
  if (!property.property_images?.length) return null
  return [...property.property_images].sort((a, b) => a.sort_order - b.sort_order)[0].image_url
}

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
  const isDesktop = useIsDesktop(900)
  const [profile, setProfile] = useState(undefined) // undefined = 로딩중, null = 미로그인
  const [tab, setTab] = useState('open') // 'open' | 'mine'
  const [requests, setRequests] = useState([])
  const [myResponses, setMyResponses] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [searchText, setSearchText] = useState('')
  const [roomTypeFilter, setRoomTypeFilter] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: profileData, error: profileError } = await getCurrentProfile()
      if (profileError) { setError(profileError); setLoading(false); return }
      setProfile(profileData)

      if (profileData?.role === 'realtor') {
        const [openResult, mineResult] = await Promise.all([listOpenRequests(), listMyPropertyResponses()])
        if (openResult.error) setError(openResult.error)
        else setRequests(openResult.data)
        if (mineResult.error) setError(mineResult.error)
        else setMyResponses(mineResult.data)
      }
      setLoading(false)
    }
    load()
  }, [])

  // 이미 내가 응답을 보낸 요청서는 "받을 수 있는 요청" 목록에서 제외 (같은 고객에게 중복 응답 방지)
  const respondedRequestIds = useMemo(() => new Set(myResponses.map((p) => p.request_id)), [myResponses])

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (respondedRequestIds.has(r.id)) return false
      const matchesSearch = !searchText.trim() || r.region_text.toLowerCase().includes(searchText.trim().toLowerCase())
      const matchesRoomType = !roomTypeFilter || (r.room_types || []).includes(roomTypeFilter)
      return matchesSearch && matchesRoomType
    })
  }, [requests, searchText, roomTypeFilter, respondedRequestIds])

  const filteredMyResponses = useMemo(() => {
    if (!searchText.trim()) return myResponses
    return myResponses.filter((p) => (p.requests?.region_text || p.address || '').toLowerCase().includes(searchText.trim().toLowerCase()))
  }, [myResponses, searchText])

  async function handleLogout() {
    await signOut()
    navigate('/partner/login')
  }

  if (loading) {
    return <div className="frame"><div className="rd-guard">불러오는 중...</div></div>
  }

  if (!profile || profile.role !== 'realtor') {
    return (
      <div className="frame">
        <div className="rd-guard">
          <div style={{ fontSize: 32 }}>🔒</div>
          <p style={{ fontWeight: 700 }}>공인중개사 계정으로 로그인해야 볼 수 있는 화면이에요</p>
          <Link to="/partner/login" style={{ color: 'var(--pink)', fontWeight: 700 }}>파트너 로그인하러 가기</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`frame rd-root${isDesktop ? ' rd-root--desktop' : ''}`}>
      <div className="rd-header">
        <div className="rd-title">roomting partners</div>
        <button className="mp-logout" style={{ background: 'none', border: 'none', color: 'var(--pink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }} onClick={handleLogout}>로그아웃</button>
      </div>

      <div className="rd-profile-row">
        <div className="rd-profile-avatar">{(profile.nickname || '?').charAt(0).toUpperCase()}</div>
        <div>
          <div className="rd-profile-name">{profile.nickname}</div>
          <div className="rd-profile-sub">후기 · 응답률 통계는 준비 중이에요</div>
        </div>
      </div>

      <div className="rd-toolbar">
        <div className="rd-tabs">
          <button className={`rd-tab${tab === 'open' ? ' active' : ''}`} onClick={() => setTab('open')}>받을 수 있는 요청</button>
          <button className={`rd-tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>내가 보낸 응답</button>
        </div>

        <div className="rd-filter-bar">
          <input
            className="rd-search-input"
            type="text"
            placeholder="지역/역명으로 검색"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {tab === 'open' && (
            <div className="rd-filter-chips">
              <span
                className={`rd-filter-chip${!roomTypeFilter ? ' active' : ''}`}
                onClick={() => setRoomTypeFilter(null)}
              >전체</span>
              {ROOM_TYPE_FILTERS.map((code) => (
                <span
                  key={code}
                  className={`rd-filter-chip${roomTypeFilter === code ? ' active' : ''}`}
                  onClick={() => setRoomTypeFilter(code)}
                >{roomTypeLabels[code]}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="rt-error-text" style={{ padding: '0 20px' }}>{error}</div>}

      {tab === 'open' && (
        filteredRequests.length === 0 ? (
          <div className="rd-empty">조건에 맞는 요청서가 없어요</div>
        ) : isDesktop ? (
          <div className="rd-table-wrap">
            <table className="rd-table">
              <thead>
                <tr>
                  <th>지역</th>
                  <th>예산</th>
                  <th>방 유형</th>
                  <th>계약기간</th>
                  <th>메모</th>
                  <th>등록일</th>
                  <th>응답</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((r) => (
                  <tr key={r.id} className="rd-row-clickable" onClick={() => navigate(`/realtor/respond/${r.id}`)}>
                    <td className="rd-td-region">
                      {r.region_text}
                      {r.registration_required && <span className="rd-tag neutral">전입신고 필요</span>}
                      {r.move_in_date && <span className="rd-tag neutral">입주 {r.move_in_date}</span>}
                    </td>
                    <td>보증금 {Number(r.deposit_max ?? 0).toLocaleString()}만원 / 월세 {r.rent_max ?? 0}만원</td>
                    <td>
                      <div className="rd-tags">
                        {(r.room_types || []).map((rt) => (
                          <span className="rd-tag" key={rt}>{roomTypeLabels[rt] || rt}</span>
                        ))}
                      </div>
                    </td>
                    <td>{r.contract_months ?? '-'}개월</td>
                    <td className="rd-td-note">{r.extra_note || '-'}</td>
                    <td>{timeAgo(r.created_at)}</td>
                    <td className="rd-response-count">{r.response_count}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rd-list">
            {filteredRequests.map((r) => (
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
        )
      )}

      {tab === 'mine' && (
        filteredMyResponses.length === 0 ? (
          <div className="rd-empty">조건에 맞는 응답이 없어요</div>
        ) : isDesktop ? (
          <div className="rd-table-wrap">
            <table className="rd-table">
              <thead>
                <tr>
                  <th>사진</th>
                  <th>지역</th>
                  <th>매물명</th>
                  <th>방 유형</th>
                  <th>보증금 / 월세</th>
                  <th>등록일</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredMyResponses.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="rd-thumb">
                        {thumbnailUrl(p) ? <img src={thumbnailUrl(p)} alt={p.title} /> : '🏠'}
                      </div>
                    </td>
                    <td className="rd-td-region">{p.requests?.region_text || p.address}</td>
                    <td>{p.title}</td>
                    <td><span className="rd-tag neutral">{roomTypeLabels[p.room_type] || p.room_type}</span></td>
                    <td>보증금 {Number(p.deposit ?? 0).toLocaleString()}만원 / 월세 {p.monthly_rent ?? 0}만원</td>
                    <td>{timeAgo(p.created_at)}</td>
                    <td>
                      <Link to={`/chat/${p.id}`} className="rt-btn-primary" style={{ padding: '6px 14px', fontSize: 12.5, textDecoration: 'none', width: 'auto', display: 'inline-block' }}>채팅하기</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rd-list">
            {filteredMyResponses.map((p) => (
              <div key={p.id} className="rd-card rd-card-mine">
                <div className="rd-thumb rd-thumb-card">
                  {thumbnailUrl(p) ? <img src={thumbnailUrl(p)} alt={p.title} /> : '🏠'}
                </div>
                <div className="rd-card-mine-body">
                  <div className="rd-card-top">
                    <span className="rd-region">{p.requests?.region_text || p.address}</span>
                    <span className="rd-time">{timeAgo(p.created_at)}</span>
                  </div>
                  <div className="rd-budget">{p.title}</div>
                  <div className="rd-tags">
                    <span className="rd-tag neutral">{roomTypeLabels[p.room_type] || p.room_type}</span>
                    <span className="rd-tag neutral">보증금 {Number(p.deposit ?? 0).toLocaleString()}만원 / 월세 {p.monthly_rent ?? 0}만원</span>
                  </div>
                  <div className="rd-footer">
                    <Link to={`/chat/${p.id}`} className="rt-btn-primary" style={{ padding: '8px 16px', fontSize: 13, textDecoration: 'none', width: 'auto' }}>채팅하기</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
