import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import { signOut } from '../../api/auth.api'
import { listOpenRequestsForRealtor, listMyResponsesForRealtor } from '../../api/realtorRequests.api'
import { stationLabel, stationSearchText } from '../../shared/format/stationLabel'
import {
  listMyPublicListings,
  createPublicProperty,
  updatePublicProperty,
  updateListingStatus,
  uploadPropertyImages,
} from '../../api/properties.api'
import { searchAddressCandidates } from '../../lib/kakaoMaps'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useAuth } from '../../shared/auth/useAuth'
import { roomTypeLabels } from './roomTypeLabels'
import { formatKrwAmount } from '../../shared/format/krwAmount'
import './RealtorDashboard.css'

const ROOM_TYPE_FILTERS = ['one_room', 'two_room', 'goshiwon', 'share_house', 'officetel', 'apartment']

// 요청서의 거래 조건 표시 문구. 전세는 rent_max가 항상 null이므로 기존 월세 표기(?? 0 폴백)를
// 그대로 쓰면 "월세 0만원"으로 잘못 보인다.
function dealSummaryText(r) {
  if (r.deal_type === 'jeonse') {
    const maxText = formatKrwAmount(r.deposit_max, 'ko')
    return r.deposit_min != null
      ? `전세보증금 ${formatKrwAmount(r.deposit_min, 'ko')} ~ ${maxText}`
      : `전세보증금 ${maxText} 이하`
  }
  return `보증금 ${Number(r.deposit_max ?? 0).toLocaleString()}만원 / 월세 ${r.rent_max ?? 0}만원`
}
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
  const { profile } = useAuth() // RealtorRoute가 이미 role==='realtor'까지 확인한 뒤에만 이 컴포넌트가 렌더됨
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
  const [editingId, setEditingId] = useState(null) // null = 신규 등록, 아니면 수정 중인 매물 id
  const [editingImages, setEditingImages] = useState([]) // 수정 중인 매물의 기존 사진(읽기전용 표시용)

  useEffect(() => {
    async function load() {
      const [openResult, mineResult, listingsResult] = await Promise.all([
        listOpenRequestsForRealtor(),
        listMyResponsesForRealtor(),
        listMyPublicListings(),
      ])
      if (openResult.error) setError(openResult.error)
      else setRequests(openResult.data)
      if (mineResult.error) setError(mineResult.error)
      else setMyResponses(mineResult.data)
      if (listingsResult.error) setError(listingsResult.error)
      else setListings(listingsResult.data)
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

  // 이미 내가 응답을 보낸 요청서는 "받을 수 있는 요청" 목록에서 제외한다.
  //
  // ★ 별도 조회로 세지 않고 RPC 가 함께 주는 my_response_count 를 쓴다.
  //   예전에는 myResponses 를 훑어 request_id 집합을 만들었는데, 두 목록의 로딩 순서에
  //   따라 필터가 흔들릴 수 있었다.
  //
  // ★ 이 제외는 migration_007 의 properties_request_realtor_unique(request_id, realtor_id)
  //   가 아직 살아 있기 때문이다 - 두 번째 응답은 23505 로 거부된다. migration_031 이 그
  //   제약을 제거하면(031:91) 요청서 하나에 매물을 5개까지 보낼 수 있게 되고, 그때는
  //   숨기는 대신 "내가 N개 제안함" 배지로 바꿔야 한다(029:117-120 이 그 설계다).
  //   031 적용 시 이 한 줄만 지우면 된다.
  const filteredRequests = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    return requests.filter((r) => {
      if (r.my_response_count > 0) return false
      const matchesSearch = !keyword || stationSearchText(r).toLowerCase().includes(keyword)
      const matchesRoomType = !roomTypeFilter || (r.room_types || []).includes(roomTypeFilter)
      return matchesSearch && matchesRoomType
    })
  }, [requests, searchText, roomTypeFilter])

  const filteredMyResponses = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) return myResponses
    return myResponses.filter((p) => `${stationSearchText(p)} ${p.address ?? ''}`.toLowerCase().includes(keyword))
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

  function resetListingForm() {
    setEditingId(null); setEditingImages([])
    setListingTitle(''); setAddress(''); setListingDescription('')
    setListingDeposit(''); setListingMonthlyRent(''); setListingRoomType(''); setListingStatus('active'); setAddressPublic(true)
    setPhotoFiles([]); setCoords(null)
  }

  function handleStartEdit(property) {
    setError(null)
    setEditingId(property.id)
    setEditingImages([...(property.property_images || [])].sort((a, b) => a.sort_order - b.sort_order))
    setListingTitle(property.title || '')
    setListingRoomType(property.room_type || '')
    setListingDeposit(property.deposit != null ? String(property.deposit) : '')
    setListingMonthlyRent(property.monthly_rent != null ? String(property.monthly_rent) : '')
    setListingDescription(property.description || '')
    setListingStatus(property.listing_status || 'active')
    setAddressPublic(property.address_public !== false)
    setAddress(property.address || '')
    setCoords(property.lat != null && property.lng != null ? { lat: property.lat, lng: property.lng } : null)
    setPhotoFiles([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const canSubmitListing = listingTitle.trim() && address.trim() && listingDeposit !== '' && listingMonthlyRent !== '' && listingRoomType && coords

  async function handleSubmitListing() {
    setError(null)
    setSubmittingListing(true)

    const payload = {
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
    }

    const { data: saved, error: saveError } = editingId
      ? await updatePublicProperty(editingId, payload)
      : await createPublicProperty(payload)
    if (saveError) { setSubmittingListing(false); setError(saveError); return }

    if (photoFiles.length > 0) {
      const { error: imageError } = await uploadPropertyImages(saved.id, photoFiles, editingImages.length)
      if (imageError) setError(imageError)
    }

    const { data: refreshed, error: refreshError } = await listMyPublicListings()
    if (!refreshError) setListings(refreshed)

    setSubmittingListing(false)
    resetListingForm()
  }

  async function handleListingStatusChange(propertyId, newStatus) {
    const { error: updateError } = await updateListingStatus(propertyId, newStatus)
    if (updateError) { setError(updateError); return }
    setListings((prev) => prev.map((p) => (p.id === propertyId ? { ...p, listing_status: newStatus } : p)))
  }

  // role/심사 상태 확인은 RealtorRoute가 이미 끝냈으므로 여기서는 이 페이지 자체의 데이터 로딩만 처리
  if (loading) {
    return <div className="frame"><div className="rd-guard">불러오는 중...</div></div>
  }

  return (
    <div className={`frame rd-root${isDesktop ? ' rd-root--desktop' : ''}`}>
      <div className="rd-header">
        <div className="rd-title">roomting partners</div>
        <button className="mp-logout" style={{ background: 'none', border: 'none', color: 'var(--coral)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }} onClick={handleLogout}>로그아웃</button>
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
                      {stationLabel(r)}
                      {r.registration_required && <span className="rd-tag neutral">전입신고 필요</span>}
                      {r.move_in_date && <span className="rd-tag neutral">입주 {r.move_in_date}</span>}
                    </td>
                    <td>{dealSummaryText(r)}</td>
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
                  <span className="rd-region">{stationLabel(r)}</span>
                  <span className="rd-time">{timeAgo(r.created_at)}</span>
                </div>
                <div className="rd-budget">{dealSummaryText(r)}</div>
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
                  <tr key={p.property_id}>
                    <td>
                      <div className="rd-thumb">
                        {thumbnailUrl(p) ? <img src={thumbnailUrl(p)} alt={p.title} /> : <Home size={18} strokeWidth={1.75} />}
                      </div>
                    </td>
                    <td className="rd-td-region">{stationLabel(p, { fallback: p.address })}</td>
                    <td>{p.title}</td>
                    <td><span className="rd-tag neutral">{roomTypeLabels[p.room_type] || p.room_type}</span></td>
                    <td>보증금 {Number(p.deposit ?? 0).toLocaleString()}만원 / 월세 {p.monthly_rent ?? 0}만원</td>
                    <td>{timeAgo(p.created_at)}</td>
                    <td>
                      <Link to={`/chat/${p.property_id}`} className="rt-btn-primary" style={{ padding: '6px 14px', fontSize: 12.5, textDecoration: 'none', width: 'auto', display: 'inline-block' }}>채팅하기</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rd-list">
            {filteredMyResponses.map((p) => (
              <div key={p.property_id} className="rd-card rd-card-mine">
                <div className="rd-thumb rd-thumb-card">
                  {thumbnailUrl(p) ? <img src={thumbnailUrl(p)} alt={p.title} /> : <Home size={22} strokeWidth={1.75} />}
                </div>
                <div className="rd-card-mine-body">
                  <div className="rd-card-top">
                    <span className="rd-region">{stationLabel(p, { fallback: p.address })}</span>
                    <span className="rd-time">{timeAgo(p.created_at)}</span>
                  </div>
                  <div className="rd-budget">{p.title}</div>
                  <div className="rd-tags">
                    <span className="rd-tag neutral">{roomTypeLabels[p.room_type] || p.room_type}</span>
                    <span className="rd-tag neutral">보증금 {Number(p.deposit ?? 0).toLocaleString()}만원 / 월세 {p.monthly_rent ?? 0}만원</span>
                  </div>
                  <div className="rd-footer">
                    <Link to={`/chat/${p.property_id}`} className="rt-btn-primary" style={{ padding: '8px 16px', fontSize: 13, textDecoration: 'none', width: 'auto' }}>채팅하기</Link>
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
            <div className="rd-form-title">{editingId ? '공개 매물 수정' : '공개 매물 등록'}</div>

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
              <label>매물 사진 {editingId ? '(새로 추가할 사진 선택)' : '(여러 장 선택 가능)'}</label>
              {editingImages.length > 0 && (
                <div className="rd-existing-photos">
                  {editingImages.map((img, i) => (
                    <div className="rd-existing-photo" key={i}><img src={img.image_url} alt="" /></div>
                  ))}
                </div>
              )}
              <input type="file" accept="image/*" multiple onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))} />
              {photoFiles.length > 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{photoFiles.length}장 선택됨</div>}
            </div>

            <button className="rt-btn-primary" disabled={!canSubmitListing || submittingListing} onClick={handleSubmitListing}>
              {submittingListing ? (editingId ? '수정하는 중...' : '등록하는 중...') : (editingId ? '매물 수정하기' : '매물 등록하기')}
            </button>
            {editingId && (
              <button className="rt-btn-secondary" disabled={submittingListing} onClick={resetListingForm}>
                취소하고 새로 등록하기
              </button>
            )}
          </div>

          <div className="rd-list-title">등록한 공개 매물 ({listings.length})</div>
          {listings.length === 0 ? (
            <div className="rd-empty">아직 등록한 공개 매물이 없어요</div>
          ) : (
            <div className="rd-list">
              {listings.map((p) => (
                <div key={p.id} className="rd-listing-row">
                  <div className="rd-thumb">
                    {thumbnailUrl(p) ? <img src={thumbnailUrl(p)} alt={p.title} /> : <Home size={18} strokeWidth={1.75} />}
                  </div>
                  <div className="rd-listing-info">
                    <div className="rd-listing-title">{p.title}</div>
                    <div className="rd-listing-sub">{p.address} · 보증금 {Number(p.deposit ?? 0).toLocaleString()}만원 / 월세 {p.monthly_rent ?? 0}만원</div>
                  </div>
                  <div className="rd-listing-actions">
                    <select className="rt-input" style={{ width: 110 }} value={p.listing_status} onChange={(e) => handleListingStatusChange(p.id, e.target.value)}>
                      {Object.entries(LISTING_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                    <button className="rd-listing-edit-btn" onClick={() => handleStartEdit(p)}>수정</button>
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
