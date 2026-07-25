import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentProfile, signOut } from '../../api/auth.api'
import { listAllPublicListings, updateListingStatus } from '../../api/properties.api'
import { listAllRequests, closeRequest } from '../../api/requests.api'
import { listRealtorApplications, getApplicationDocumentUrl, approveRealtorApplication } from '../../api/realtorApplication.api'
import './AdminDashboard.css'

const LISTING_STATUS_LABELS = { active: '판매중', completed: '거래완료', hidden: '미노출' }
const REQUEST_STATUS_LABELS = { open: '응답 대기중', closed: '종료됨', expired: '기한 만료' }
const APPLICATION_ROLE_LABELS = { pending_realtor: '심사중', realtor: '승인됨' }

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

// 운영자 페이지: 매물 "등록"은 각 공인중개사 계정이 파트너 대시보드에서 직접 하고(realtor_id는 항상 본인),
// 여기서는 전체 공개 매물 노출상태 관리와 요청서 전체 조회/강제종료만 함
export default function AdminDashboard() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(undefined) // undefined = 로딩중, null = 미로그인
  const [tab, setTab] = useState('listings')

  const [listings, setListings] = useState([])
  const [requests, setRequests] = useState([])
  const [applications, setApplications] = useState([])
  const [error, setError] = useState(null)
  const [approvingId, setApprovingId] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: profileData, error: profileError } = await getCurrentProfile()
      if (profileError) { setError(profileError); setProfile(null); return }
      setProfile(profileData)
      if (profileData?.role !== 'admin') { navigate('/', { replace: true }); return }

      const [listingsResult, requestsResult, applicationsResult] = await Promise.all([
        listAllPublicListings(),
        listAllRequests(),
        listRealtorApplications(),
      ])
      if (listingsResult.error) setError(listingsResult.error)
      else setListings(listingsResult.data)
      if (requestsResult.error) setError(requestsResult.error)
      else setRequests(requestsResult.data)
      if (applicationsResult.error) setError(applicationsResult.error)
      else setApplications(applicationsResult.data)
    }
    load()
  }, [navigate])

  async function handleStatusChange(propertyId, newStatus) {
    const { error: updateError } = await updateListingStatus(propertyId, newStatus)
    if (updateError) { setError(updateError); return }
    setListings((prev) => prev.map((p) => (p.id === propertyId ? { ...p, listing_status: newStatus } : p)))
  }

  async function handleForceClose(requestId) {
    if (!window.confirm('이 요청서를 강제로 종료할까요?')) return
    const { error: closeError } = await closeRequest(requestId)
    if (closeError) { setError(closeError); return }
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: 'closed' } : r)))
  }

  async function handleViewDocument(path) {
    const { data: url, error: urlError } = await getApplicationDocumentUrl(path)
    if (urlError) { setError(urlError); return }
    window.open(url, '_blank')
  }

  async function handleLogout() {
    await signOut()
    navigate('/login/customer', { replace: true })
  }

  async function handleApprove(application) {
    if (!window.confirm(`${application.company_name}을(를) 승인할까요? 승인하면 파트너 로그인이 가능해져요.`)) return
    setApprovingId(application.id)
    const { error: approveError } = await approveRealtorApplication(application.profile_id)
    setApprovingId(null)
    if (approveError) { setError(approveError); return }
    setApplications((prev) => prev.map((a) => (
      a.id === application.id ? { ...a, profile: { ...a.profile, role: 'realtor' } } : a
    )))
  }

  if (profile === undefined) {
    return <div className="frame ad-frame"><div className="ad-guard">불러오는 중...</div></div>
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="frame ad-frame">
        <div className="ad-guard">
          <div style={{ fontSize: 32 }}>🔒</div>
          <p style={{ fontWeight: 700 }}>운영자 계정으로 로그인해야 볼 수 있는 화면이에요</p>
          <Link to="/login" style={{ color: 'var(--pink)', fontWeight: 700 }}>로그인하러 가기</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="frame ad-frame">
      <div className="ad-header">
        <div className="ad-title">roomting admin</div>
        <button className="ad-logout" onClick={handleLogout}>로그아웃</button>
      </div>

      <div className="ad-tabs">
        <button className={`ad-tab${tab === 'listings' ? ' active' : ''}`} onClick={() => setTab('listings')}>공개 매물 관리</button>
        <button className={`ad-tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>요청서 관리</button>
        <button className={`ad-tab${tab === 'applications' ? ' active' : ''}`} onClick={() => setTab('applications')}>가입 신청</button>
      </div>

      {error && <div className="rt-error-text" style={{ padding: '0 24px' }}>{error}</div>}

      {tab === 'listings' && (
        <div className="ad-body">
          <div className="ad-list-title">등록된 공개 매물 ({listings.length}) · 매물 등록은 부동산 계정이 파트너 대시보드에서 직접 진행해요</div>
          <div className="ad-list">
            {listings.length === 0 ? (
              <div className="ad-empty">아직 등록된 공개 매물이 없어요</div>
            ) : listings.map((p) => (
              <div key={p.id} className="ad-listing-row">
                <div className="ad-thumb">
                  {thumbnailUrl(p) ? <img src={thumbnailUrl(p)} alt={p.title} /> : '🏠'}
                </div>
                <div className="ad-listing-info">
                  <div className="ad-listing-title">{p.title}</div>
                  <div className="ad-listing-sub">{p.address} · {p.realtor?.nickname} · 보증금 {Number(p.deposit ?? 0).toLocaleString()}만원 / 월세 {p.monthly_rent ?? 0}만원</div>
                </div>
                <select className="rt-input" style={{ width: 110 }} value={p.listing_status} onChange={(e) => handleStatusChange(p.id, e.target.value)}>
                  {Object.entries(LISTING_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="ad-body">
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>지역</th>
                  <th>고객</th>
                  <th>상태</th>
                  <th>등록일</th>
                  <th>응답</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="ad-td-region">{r.region_text}</td>
                    <td>{r.customer?.nickname ?? '-'}</td>
                    <td>{REQUEST_STATUS_LABELS[r.status] || r.status}</td>
                    <td>{timeAgo(r.created_at)}</td>
                    <td className="ad-response-count">{r.response_count}건</td>
                    <td>
                      <button
                        className="rt-btn-secondary"
                        style={{ width: 'auto', padding: '6px 14px', fontSize: 12.5 }}
                        disabled={r.status !== 'open'}
                        onClick={() => handleForceClose(r.id)}
                      >강제 종료</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'applications' && (
        <div className="ad-body">
          {applications.length === 0 ? (
            <div className="ad-empty">아직 들어온 가입 신청이 없어요</div>
          ) : (
            <div className="ad-list">
              {applications.map((a) => (
                <div key={a.id} className="ad-app-card">
                  <div className="ad-app-top">
                    <div className="ad-app-company">{a.company_name}</div>
                    <span className={`ad-app-status${a.profile?.role === 'realtor' ? ' approved' : ''}`}>
                      {APPLICATION_ROLE_LABELS[a.profile?.role] || a.profile?.role}
                    </span>
                  </div>
                  <div className="ad-app-grid">
                    <div><span>사업자등록번호</span>{a.business_registration_number}</div>
                    <div><span>중개등록번호</span>{a.broker_registration_number}</div>
                    <div><span>유선전화번호</span>{a.landline_phone}</div>
                    <div><span>담당자</span>{a.contact_name} · {a.contact_phone}</div>
                    <div className="ad-app-grid-wide"><span>주소</span>{a.company_address}</div>
                  </div>
                  <div className="ad-app-actions">
                    <button className="rt-btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5 }} onClick={() => handleViewDocument(a.document_path)}>사업자등록증 보기</button>
                    <button className="rt-btn-secondary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5 }} onClick={() => handleViewDocument(a.broker_registration_document_path)}>중개등록증 보기</button>
                    <button
                      className="rt-btn-primary"
                      style={{ width: 'auto', padding: '8px 16px', fontSize: 12.5, marginLeft: 'auto' }}
                      disabled={a.profile?.role === 'realtor' || approvingId === a.id}
                      onClick={() => handleApprove(a)}
                    >{a.profile?.role === 'realtor' ? '승인 완료' : approvingId === a.id ? '승인하는 중...' : '승인하기'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
