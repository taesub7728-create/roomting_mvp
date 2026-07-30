import { useNavigate } from 'react-router-dom'
import { X, MapPin, Home } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { getRoomTypeLabel } from '../../utils/roomTypeLabel'
import { sortedImageUrls } from '../../utils/propertyImages'
import ImageCarousel from '../../components/ImageCarousel'
import { mapText } from './translations'

// 지도 핀 클릭 시 뜨는 공개 미리보기. 로그인 여부와 무관하게 항상 같은 공개 필드(사진/가격/
// display_address/방타입)만 보여준다 - 정확 주소/좌표/연락처는 property 객체 자체에 없음
// (get_public_listings가 이미 마스킹해서 내려줌).
// 실제 상세 조회/채팅 생성은 여기서 직접 하지 않고 PropertyDetail 화면에 위임한다
// (버튼은 이동만 담당, API 직접 호출 없음).
export default function PropertyPreviewModal({ property, isLoggedIn, onClose }) {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = mapText[lang]

  function goToDetail() {
    if (!isLoggedIn) { navigate('/login'); return }
    navigate(`/property/${property.id}`, { state: { property } })
  }

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-card" onClick={(e) => e.stopPropagation()}>
        <button className="preview-close" onClick={onClose} aria-label="close">
          <X size={16} strokeWidth={2.5} />
        </button>

        <div className="preview-img">
          <ImageCarousel
            images={sortedImageUrls(property)}
            placeholder={<Home size={32} strokeWidth={1.5} color="#C3BCB6" />}
          />
        </div>

        <div className="preview-body">
          <div className="preview-price">
            {t.rentLabel} {Number(property.monthly_rent ?? 0).toLocaleString()}만원
            <span className="deposit">{t.depositLabel} {Number(property.deposit ?? 0).toLocaleString()}만원</span>
          </div>
          <div className="preview-location">
            <MapPin size={12} strokeWidth={2} /> <span>{property.display_address}</span>
          </div>
          <span className="badge badge-type">{getRoomTypeLabel(lang, property.room_type)}</span>
        </div>

        <div className="preview-actions">
          <button className="rt-btn-primary" onClick={goToDetail}>{t.previewDetailBtn}</button>
        </div>
      </div>
    </div>
  )
}
