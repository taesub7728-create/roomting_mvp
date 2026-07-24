import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentProfile, signOut } from '../../api/auth.api'
import { listOpenRequests } from '../../api/requests.api'
import {
  listMyPropertyResponses,
  listMyPublicListings,
  createPublicProperty,
  updateListingStatus,
  uploadPropertyImages,
} from '../../api/properties.api'
import { searchAddressCandidates } from '../../lib/kakaoMaps'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { roomTypeLabels } from './roomTypeLabels'
import './RealtorDashboard.css'

const ROOM_TYPE_FILTERS = ['one_room', 'two_room', 'goshiwon', 'share_house', 'officetel', 'apartment']
const LISTING_STATUS_LABELS = { active: '판매중', completed: '거래완료', hidden: '미노출' }

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
  const [tab, setTab] = useState('open') // 'open' | 'mine' | 'listings'
  const [requests, setRequests] = useState([])
  const [myResponses, setMyResponses] = useState([])
  const [listings, setListings] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [searchText, setSearchText] = useState('')
  const [roomTypeFilter, setRoomTypeFilter] = useState(null)

  // 공개 매물(지도) 등록 폼 상태 - 담당 부동산은 항상 로그인한 본인이라 별도 선택 없음
  const [listingTitle, setListingTitle] = useState('')
  const [listingRoomType, setListingRoomType] = useState('')
  const [listingDeposit, setListingDeposit] = useState('')
  const [listingMonthlyRent, setListingMonthlyRent] = useState('')
  const [listingDescription, setListingDescription] = useState('')
  const [listingStatus, setListingStatus] = useState('active')
  const [addressPublic, setAddressPublic] = useState(true)
  const [photoFiles, setPhotoFiles] = useState([])
  const [address, setAddress] = useState('') // 후보 목록에서 선택된 최종 주소
  const [coords, setCoords] = useState(null) // 선택된 주소의 좌표
  const [addressQuery, setAddressQuery] = useState('')
  const [addressCandidates, setAddressCandidates] = useState([])
  const [addressSearching, setAddressSearching] = useState(false)
  const [submittingListing, setSubmittingListing] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: profileData, error: profileError } = await getCurrentProfile()
      if (profileError) { setError(profileError); setLoading(false); return }
      setProfile(profileData)

      if (profileData?.role === 'realtor') {
        const [openResult, mineResult, listingsResult] = await Promise.all([
          listOpenRequests(),
          listMyPropertyResponses(),
          listMyPublicListings(),
        ])
        if (openResult.error) setError(openResult.error)
        else setRequests(openResult.data)
        if (mineResult.error) setError(mineResult.error)
        else setMyResponses(mineResult.data)
        if (listingsResult.error) setError(listingsResult.error)
        else setListings(listingsResult.data)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    const query = addressQuery.trim()
    if (query.length < 2) { setAddressCandidates([]); return }

    setAddressSearching(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddressCandidates(query)
        setAddressCandidates(results)
      } catch (err) {
        setError(err.message)
      }
      setAddressSearching(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [addressQuery])

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

  function handleSelectAddress(candidate) {
    setAddress(candidate.label)
    setCoords({ lat: candidate.lat, lng: candidate.lng })
    setAddressQuery('')
    setAddressCandidates([])
  }

  function handleChangeAddress() {
    setAddress('')
    setCoords(null)
  }

  const canSubmitListing = listingTitle.trim() && address.trim() && listingDeposit !== '' && listingMonthlyRent !== '' && listingRoomType && coords

  async function handleCreateListing() {
    setError(null)
    setSubmittingListing(true)
    const { data: created, error: createError } = await createPublicProperty({
      title: listingTitle.trim(),
      address: address.trim(),
      description: listingDescription,
      deposit: Number(listingDeposit),
      monthlyRent: Number(listingMonthlyRent),
      roomType: listingRoomType,
      lat: coords.lat,
      lng: coords.lng,
      listingStatus,
      addressPublic,
    })
    if (createError) { setSubmittingListing(false); setError(createError); return }

    if (photoFiles.length > 0) {
      const { error: imageError } = await uploadPropertyImages(created.id, photoFiles)
      if (imageError) setError(imageError)
    }

    const { data: refreshed, error: refreshError } = await listMyPublicListings()
    if (!refreshError) setListings(refreshed)

    setSubmittingListing(false)
    setListingTitle(''); setAddress(''); setListingDescription('')
    setListingDeposit(''); setListingMonthlyRent(''); setListingRoomType(''); setListingStatus('active'); setAddressPublic(true)
    setPhotoFiles([]); setCoords(null)
  }

  async function handleListingStatusChange(propertyId, newStatus) {
    const { error: updateError } = await updateListingStatus(propertyId, newStatus)
    if (updateError) { setError(updateError); return }
    setListings((prev) => prev.map((p) => (p.id === propertyId ? { ...p, listing_status: newStatus } : p)))
  }

  if (loading) {
    return <div className="frame"><div className="rd-guard">불러오는 중...</div></div>
  }

  if (profile?.role === 'pending_realtor') {
    return (
      <div className="frame">
        <div className="rd-guard">
          <div style={{ fontSize: 32 }}>⏳</div>
          <p style={{ fontWeight: 700 }}>아직 심사 중이에요</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>승인되면 안내드릴게요. 조금만 기다려주세요</p>
        </div>
      </div>
    )
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
          <button className={`rd-tab${tab === 'listings' ? ' active' : ''}`} onClick={() => setTab('listings')}>공개 매물</button>
        </div>

        {tab !== 'listings' && (
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
        )}
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

      {tab === 'listings' && (
        <div className="rd-listings-body">
          <div className="rd-form-card">
            <div className="rd-form-title">공개 매물 등록</div>

            <div className="rd-field">
              <label>매물 제목</label>
              <input className="rt-input" type="text" value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} placeholder="예) 합정역 도보 5분 신축 원룸" />
            </div>

            <div className="rd-field">
              <label>방 타입</label>
              <div className="rd-form-chip-group">
                {ROOM_TYPE_FILTERS.map((code) => (
                  <div key={code} className={`rd-form-chip${listingRoomType === code ? ' active' : ''}`} onClick={() => setListingRoomType(code)}>
                    {roomTypeLabels[code]}
                  </div>
                ))}
              </div>
            </div>

            <div className="rd-two-col">
              <div className="rd-field">
                <label>보증금 (만원)</label>
                <input className="rt-input" type="number" value={listingDeposit} onChange={(e) => setListingDeposit(e.target.value)} placeholder="1000" />
              </div>
              <div className="rd-field">
                <label>월세 (만원)</label>
                <input className="rt-input" type="number" value={listingMonthlyRent} onChange={(e) => setListingMonthlyRent(e.target.value)} placeholder="55" />
              </div>
            </div>

            <div className="rd-field">
              <label>주소</label>
              {address ? (
                <div className="rd-address-selected">
                  <span>{address}</span>
                  <button className="rd-address-change" onClick={handleChangeAddress}>변경</button>
                </div>
              ) : (
                <div className="rd-address-search">
                  <input
                    className="rt-input"
                    type="text"
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    placeholder="예) 서교동 336-7 (2글자 이상 입력하면 검색돼요)"
                  />
                  {addressSearching && <div className="rd-address-hint">검색 중...</div>}
                  {!addressSearching && addressQuery.trim().length >= 2 && addressCandidates.length === 0 && (
                    <div className="rd-address-hint">일치하는 주소가 없어요</div>
                  )}
                  {addressCandidates.length > 0 && (
                    <div className="rd-address-dropdown">
                      {addressCandidates.map((c, i) => (
                        <div key={i} className="rd-address-option" onClick={() => handleSelectAddress(c)}>{c.label}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rd-field">
              <label className="rd-checkbox-label">
                <input type="checkbox" checked={!addressPublic} onChange={(e) => setAddressPublic(!e.target.checked)} />
                상세주소 비공개 (지도에는 동 단위 주소 + 근처 위치로만 표시돼요)
              </label>
            </div>

            <div className="rd-field">
              <label>상세 설명</label>
              <textarea className="rd-textarea" value={listingDescription} onChange={(e) => setListingDescription(e.target.value)} placeholder="매물 특징을 적어주세요" />
            </div>

            <div className="rd-field">
              <label>노출 상태</label>
              <select className="rt-input" value={listingStatus} onChange={(e) => setListingStatus(e.target.value)}>
                {Object.entries(LISTING_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>

            <div className="rd-field">
              <label>매물 사진 (여러 장 선택 가능)</label>
              <input type="file" accept="image/*" multiple onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))} />
              {photoFiles.length > 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{photoFiles.length}장 선택됨</div>}
            </div>

            <button className="rt-btn-primary" disabled={!canSubmitListing || submittingListing} onClick={handleCreateListing}>
              {submittingListing ? '등록하는 중...' : '매물 등록하기'}
            </button>
          </div>

          <div className="rd-list-title">등록한 공개 매물 ({listings.length})</div>
          {listings.length === 0 ? (
            <div className="rd-empty">아직 등록한 공개 매물이 없어요</div>
          ) : (
            <div className="rd-list">
              {listings.map((p) => (
                <div key={p.id} className="rd-listing-row">
                  <div className="rd-thumb">
                    {thumbnailUrl(p) ? <img src={thumbnailUrl(p)} alt={p.title} /> : '🏠'}
                  </div>
                  <div className="rd-listing-info">
                    <div className="rd-listing-title">{p.title}</div>
                    <div className="rd-listing-sub">{p.address} · 보증금 {Number(p.deposit ?? 0).toLocaleString()}만원 / 월세 {p.monthly_rent ?? 0}만원</div>
                  </div>
                  <select className="rt-input" style={{ width: 110 }} value={p.listing_status} onChange={(e) => handleListingStatusChange(p.id, e.target.value)}>
                    {Object.entries(LISTING_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
