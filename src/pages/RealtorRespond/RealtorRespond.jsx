import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getOpenRequestForRealtor } from '../../api/realtorRequests.api'
import { stationLabel } from '../../shared/format/stationLabel'
import { createPropertyResponse, uploadPropertyImages } from '../../api/properties.api'
import { roomTypeLabels } from '../RealtorDashboard/roomTypeLabels'
import { formatKrwAmount } from '../../shared/format/krwAmount'
import './RealtorRespond.css'

const ROOM_TYPE_CODES = ['one_room', 'two_room', 'goshiwon', 'share_house', 'officetel', 'apartment']

// 요청서의 거래 조건 표시 문구. 전세는 rent_max가 항상 null이므로 기존 월세 표기(?? 0 폴백)를
// 그대로 쓰면 "월세 0만원"으로 잘못 보인다.
function dealSummaryText(request) {
  if (request.deal_type === 'jeonse') {
    const maxText = formatKrwAmount(request.deposit_max, 'ko')
    return request.deposit_min != null
      ? `전세보증금 ${formatKrwAmount(request.deposit_min, 'ko')} ~ ${maxText}`
      : `전세보증금 ${maxText} 이하`
  }
  return `보증금 ${Number(request.deposit_max ?? 0).toLocaleString()}만원 / 월세 ${request.rent_max ?? 0}만원`
}

export default function RealtorRespond() {
  const { requestId } = useParams()
  const navigate = useNavigate()

  const [request, setRequest] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [deposit, setDeposit] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [roomType, setRoomType] = useState('')
  const [photoFiles, setPhotoFiles] = useState([])

  const [error, setError] = useState(null)
  const [imageWarning, setImageWarning] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [createdPropertyId, setCreatedPropertyId] = useState(null)

  function handlePhotoChange(e) {
    setPhotoFiles(Array.from(e.target.files || []))
  }

  useEffect(() => {
    async function load() {
      // 내 영업지역의 open 요청서만 열린다. 조건에 맞지 않으면 에러가 아니라 0행이므로
      // data 가 null 로 온다 - 그 경우를 "권한 없음"으로 명시해 화면에 알린다.
      // (029 함수에는 RAISE 가 없어 조건 불일치가 예외로 오지 않는다)
      const { data, error: err } = await getOpenRequestForRealtor(requestId)
      if (err) setLoadError(err)
      else if (!data) setLoadError('이 요청서에 접근할 수 없어요. 담당 지역이 아니거나 이미 마감된 요청서일 수 있습니다.')
      else setRequest(data)
    }
    load()
  }, [requestId])

  const canSubmit = title.trim() && address.trim() && deposit !== '' && monthlyRent !== '' && roomType

  async function handleSubmit() {
    setError(null)
    setImageWarning(null)
    setLoading(true)
    const { data: created, error: submitError } = await createPropertyResponse({
      requestId,
      title: title.trim(),
      address: address.trim(),
      description,
      deposit: Number(deposit),
      monthlyRent: Number(monthlyRent),
      roomType,
    })
    if (submitError) { setLoading(false); setError(submitError); return }

    if (photoFiles.length > 0) {
      const { error: imageError } = await uploadPropertyImages(created.id, photoFiles)
      if (imageError) setImageWarning(imageError)
    }

    setLoading(false)
    setCreatedPropertyId(created.id)
    setSuccess(true)
  }

  if (loadError) {
    return (
      <div className="frame">
        <div className="rr-header"><Link className="rr-back" to="/realtor">←</Link><div className="rr-title">매물로 응답하기</div></div>
        <div className="rt-error-text" style={{ padding: '0 20px' }}>{loadError}</div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="frame">
        <div className="rr-header"><div className="rr-title">완료</div></div>
        <div className="rr-summary">이 요청서에 매물 응답을 등록했어요.</div>
        {imageWarning && <div className="rt-error-text" style={{ margin: '0 20px 16px' }}>{imageWarning}</div>}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {createdPropertyId && (
            <Link to={`/chat/${createdPropertyId}`} className="rt-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>고객과 채팅하기</Link>
          )}
          <Link to="/realtor" className="rt-btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>목록으로 돌아가기</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="frame">
      <div className="rr-header">
        <Link className="rr-back" to="/realtor">←</Link>
        <div className="rr-title">매물로 응답하기</div>
      </div>

      {request && (
        <div className="rr-summary">
          <b>{stationLabel(request)}</b> · {dealSummaryText(request)}
          {request.move_in_date && <> · 입주 희망일 {request.move_in_date}</>}
        </div>
      )}

      <div className="rr-body">
        <div className="rr-field">
          <label>매물 제목</label>
          <input className="rr-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 홍대입구역 도보 5분 신축 원룸" />
        </div>

        <div className="rr-field">
          <label>방 타입</label>
          <div className="rr-chip-group">
            {ROOM_TYPE_CODES.map((code) => (
              <div key={code} className={`rr-chip${roomType === code ? ' active' : ''}`} onClick={() => setRoomType(code)}>
                {roomTypeLabels[code]}
              </div>
            ))}
          </div>
        </div>

        <div className="rr-two-col">
          <div className="rr-field">
            <label>보증금 (만원)</label>
            <input className="rr-input" type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="1000" />
          </div>
          <div className="rr-field">
            <label>월세 (만원)</label>
            <input className="rr-input" type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} placeholder="55" />
          </div>
        </div>

        <div className="rr-field">
          <label>주소</label>
          <input className="rr-input" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예) 서울시 마포구 동교동 123-45" />
        </div>

        <div className="rr-field">
          <label>상세 설명</label>
          <textarea className="rr-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="매물 특징을 적어주세요" />
        </div>

        <div className="rr-field">
          <label>매물 사진 (여러 장 선택 가능)</label>
          <input type="file" accept="image/*" multiple onChange={handlePhotoChange} />
          {photoFiles.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{photoFiles.length}장 선택됨</div>
          )}
        </div>

        {error && <div className="rt-error-text">{error}</div>}

        <button className="rt-btn-primary" disabled={!canSubmit || loading} onClick={handleSubmit}>이 매물로 응답 보내기</button>
      </div>
    </div>
  )
}
