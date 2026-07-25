import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, MapPin, MessageCircle } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { getCurrentProfile } from '../../api/auth.api'
import { listPublicProperties } from '../../api/properties.api'
import { getOrCreatePropertyChatRoom } from '../../api/chat.api'
import { addFavorite, isFavorited, removeFavorite } from '../../api/favorites.api'
import { getRoomTypeLabel } from '../../utils/roomTypeLabel'
import { sortedImageUrls } from '../../utils/propertyImages'
import ImageCarousel from '../../components/ImageCarousel'
import './PropertyDetail.css'

// 지도 목록에서 이미 불러온(주소 마스킹까지 끝난) 매물 객체를 navigate state로 그대로 받아서 재사용.
// 상세 URL로 바로 들어온 경우에만 get_public_listings()로 다시 조회함 - 이 RPC라야 상세주소 비공개 매물의
// display_address/display_lat/display_lng 마스킹이 적용되므로, properties 테이블을 직접 select하면 안 됨
export default function PropertyDetail() {
  const { propertyId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()

  const [profile, setProfile] = useState(undefined) // undefined = 로딩중, null = 미로그인
  const [property, setProperty] = useState(location.state?.property ?? null)
  const [loading, setLoading] = useState(!location.state?.property)
  const [error, setError] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [liked, setLiked] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      const { data: profileData } = await getCurrentProfile()
      setProfile(profileData ?? null)
      if (profileData) {
        const { data: favorited } = await isFavorited(propertyId)
        setLiked(favorited)
      }
    }
    loadProfile()
  }, [propertyId])

  useEffect(() => {
    if (property) return
    async function loadProperty() {
      const { data, error: listError } = await listPublicProperties()
      if (listError) { setError(listError); setLoading(false); return }
      const found = data.find((p) => p.id === propertyId)
      if (!found) { setError('매물을 찾을 수 없어요'); setLoading(false); return }
      setProperty(found)
      setLoading(false)
    }
    loadProperty()
  }, [propertyId, property])

  async function handleContact() {
    setConnecting(true)
    const { error: chatError } = await getOrCreatePropertyChatRoom(propertyId)
    setConnecting(false)
    if (chatError) { setError(chatError); return }
    navigate(`/chat/${propertyId}`)
  }

  async function handleToggleFavorite() {
    setFavoriteLoading(true)
    const { error: favError } = liked ? await removeFavorite(propertyId) : await addFavorite(propertyId)
    setFavoriteLoading(false)
    if (favError) { setError(favError); return }
    setLiked((v) => !v)
  }

  if (profile === undefined || loading) {
    return <div className="frame"><div className="pd-guard">불러오는 중...</div></div>
  }

  if (!profile) {
    return (
      <div className="frame">
        <div className="pd-guard">
          <p style={{ fontWeight: 700 }}>로그인해야 볼 수 있는 화면이에요</p>
          <Link to="/login" style={{ color: 'var(--pink)', fontWeight: 700 }}>로그인하러 가기</Link>
        </div>
      </div>
    )
  }

  if (error || !property) {
    return <div className="frame"><div className="pd-guard rt-error-text">{error || '매물을 찾을 수 없어요'}</div></div>
  }

  return (
    <div className="frame">
      <div className="pd-gallery">
        <ImageCarousel
          images={sortedImageUrls(property)}
          placeholder={<div className="pd-gallery-placeholder">🏠</div>}
        />
        <button className="pd-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={18} strokeWidth={2} /></button>
      </div>

      <div className="pd-content">
        <div className="pd-price-section">
          <div className="pd-price-main">월세 {Number(property.monthly_rent ?? 0).toLocaleString()}만원</div>
          <div className="pd-price-deposit">보증금 {Number(property.deposit ?? 0).toLocaleString()}만원</div>
          <span className="pd-badge">{getRoomTypeLabel(lang, property.room_type)}</span>
        </div>

        <div className="pd-section-card">
          <div className="pd-section-title"><MapPin size={15} strokeWidth={2} /> 위치</div>
          <div className="pd-location-text">{property.display_address}</div>
        </div>

        {property.description && (
          <div className="pd-section-card">
            <div className="pd-section-title">설명</div>
            <div className="pd-description">{property.description}</div>
          </div>
        )}

        {error && <div className="rt-error-text">{error}</div>}
      </div>

      <div className="pd-bottom-cta">
        <button
          className={`pd-heart-btn${liked ? ' liked' : ''}`}
          disabled={favoriteLoading}
          onClick={handleToggleFavorite}
        >
          <Heart size={20} strokeWidth={2} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button className="rt-btn-primary pd-chat-btn" disabled={connecting} onClick={handleContact}>
          <MessageCircle size={17} strokeWidth={2} /> {connecting ? '연결하는 중...' : '문의하기'}
        </button>
      </div>
    </div>
  )
}
