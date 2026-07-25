import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { List, Locate, MapPin, Home, Heart, X } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { getCurrentProfile } from '../../api/auth.api'
import { listPublicProperties } from '../../api/properties.api'
import { addFavorite, listMyFavoriteIds, removeFavorite } from '../../api/favorites.api'
import { getRoomTypeLabel } from '../../utils/roomTypeLabel'
import { sortedImageUrls } from '../../utils/propertyImages'
import { loadKakaoMaps } from '../../lib/kakaoMaps'
import ImageCarousel from '../../components/ImageCarousel'
import BottomTabBar from '../../components/BottomTabBar'
import logo from '../../assets/roomting-logo-symbol.png'
import { mapText } from './translations'
import './MapExplore.css'

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 }
const ACTIVE_ZOOM_LEVEL = 4

export default function MapExplore() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = mapText[lang]

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const cardRefs = useRef({})

  const [profile, setProfile] = useState(undefined) // undefined = 로딩중, null = 미로그인
  const [properties, setProperties] = useState([])
  const [favoriteIds, setFavoriteIds] = useState(new Set())
  const [activeId, setActiveId] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [error, setError] = useState(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: profileData } = await getCurrentProfile()
      setProfile(profileData ?? null)
      if (!profileData) return

      const [{ data, error: listError }, { data: favoriteIdList }] = await Promise.all([
        listPublicProperties(),
        listMyFavoriteIds(),
      ])
      if (listError) setError(listError)
      else setProperties(data)
      setFavoriteIds(new Set(favoriteIdList))
    }
    load()
  }, [])

  // 낙관적으로 먼저 UI를 바꾸고, 실패하면 되돌림 (지도 카드에서 바로바로 반응하도록)
  async function handleToggleFavorite(e, propertyId) {
    e.stopPropagation()
    const wasFavorited = favoriteIds.has(propertyId)
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      wasFavorited ? next.delete(propertyId) : next.add(propertyId)
      return next
    })

    const { error: favError } = wasFavorited ? await removeFavorite(propertyId) : await addFavorite(propertyId)
    if (favError) {
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        wasFavorited ? next.add(propertyId) : next.delete(propertyId)
        return next
      })
      setError(favError)
    }
  }

  function handleLocateMe() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mapRef.current || !window.kakao) return
        const kakao = window.kakao
        mapRef.current.setLevel(ACTIVE_ZOOM_LEVEL)
        mapRef.current.panTo(new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude))
      },
      () => setError(t.locateError),
    )
  }

  // 지도 인스턴스는 한 번만 생성
  useEffect(() => {
    if (!profile) return
    if (!import.meta.env.VITE_KAKAO_MAP_API_KEY) { setError(t.noApiKey); return }

    let cancelled = false
    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) return
        const center = new kakao.maps.LatLng(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng)
        mapRef.current = new kakao.maps.Map(mapContainerRef.current, { center, level: 7 })
        setMapReady(true)
      })
      .catch((err) => setError(err?.message || t.noApiKey))

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  function selectProperty(property) {
    setActiveId(property.id)
    setSheetOpen(true)
    if (mapRef.current && window.kakao) {
      const kakao = window.kakao
      mapRef.current.setLevel(ACTIVE_ZOOM_LEVEL)
      mapRef.current.panTo(new kakao.maps.LatLng(property.display_lat, property.display_lng))
    }
  }

  function handleCardTap(property) {
    if (activeId === property.id) {
      navigate(`/property/${property.id}`, { state: { property } })
    } else {
      selectProperty(property)
    }
  }

  // 매물 목록이 준비되면 마커를 그리고, 전체가 보이도록 지도 범위를 맞춤
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao) return
    const kakao = window.kakao

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    if (properties.length === 0) return

    const bounds = new kakao.maps.LatLngBounds()
    properties.forEach((p) => {
      const position = new kakao.maps.LatLng(p.display_lat, p.display_lng)
      const marker = new kakao.maps.Marker({ position, map: mapRef.current })
      kakao.maps.event.addListener(marker, 'click', () => selectProperty(p))
      markersRef.current.push(marker)
      bounds.extend(position)
    })
    mapRef.current.setBounds(bounds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, properties])

  // 핀을 탭해서 activeId가 바뀌면, 캐러셀에서 해당 카드로 자동 스크롤
  useEffect(() => {
    if (activeId == null) return
    cardRefs.current[activeId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }, [activeId])

  if (profile === undefined) {
    return <div className="frame"><div className="me-guard">{t.loading}</div></div>
  }

  if (!profile) {
    return (
      <div className="frame">
        <div className="me-guard">
          <div style={{ fontSize: 32 }}>🔒</div>
          <p style={{ fontWeight: 700 }}>{t.needLogin}</p>
          <Link to="/login" style={{ color: 'var(--pink)', fontWeight: 700 }}>{t.goLogin}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="frame me-frame">
      <div className="me-header">
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
        </div>
      </div>

      <div className="me-map" ref={mapContainerRef}>
        {error && <div className="me-overlay-badge me-error-badge">{error}</div>}
        {!error && mapReady && properties.length === 0 && (
          <div className="me-overlay-badge">{t.emptyText}</div>
        )}
        <button className="locate-btn" onClick={handleLocateMe} aria-label={t.locateMe}>
          <Locate size={18} strokeWidth={2} />
        </button>
      </div>

      {!sheetOpen && properties.length > 0 && (
        <button className="view-toggle" onClick={() => setSheetOpen(true)}>
          <List size={14} strokeWidth={2} /> {t.viewListBtn}
        </button>
      )}

      <div className={`bottom-sheet${sheetOpen ? ' show' : ''}`}>
        <div className="cards-wrap">
          <div className="sheet-handle-area"><div className="sheet-handle"></div></div>
          <div className="cards-header">
            <div className="cards-title">{t.nearby}</div>
            <button className="cards-close" onClick={() => setSheetOpen(false)}><X size={13} strokeWidth={2.5} /></button>
          </div>
          <div className="cards-scroll">
            {properties.map((p) => (
              <div
                key={p.id}
                ref={(el) => { cardRefs.current[p.id] = el }}
                className={`listing-card${activeId === p.id ? ' highlighted' : ''}`}
                onClick={() => handleCardTap(p)}
              >
                <div className="card-img">
                  <ImageCarousel
                    images={sortedImageUrls(p)}
                    placeholder={<Home size={32} strokeWidth={1.5} color="#C3BCB6" />}
                  />
                  <div className="card-badges">
                    <span className="badge badge-type">{getRoomTypeLabel(lang, p.room_type)}</span>
                  </div>
                  <button
                    className={`card-heart${favoriteIds.has(p.id) ? ' liked' : ''}`}
                    onClick={(e) => handleToggleFavorite(e, p.id)}
                  >
                    <Heart size={14} strokeWidth={2} fill={favoriteIds.has(p.id) ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="card-info">
                  <div className="card-price">
                    {t.rentLabel} {Number(p.monthly_rent ?? 0).toLocaleString()}만원
                    <span className="deposit">{t.depositLabel} {Number(p.deposit ?? 0).toLocaleString()}만원</span>
                  </div>
                  <div className="card-location"><MapPin size={11} strokeWidth={2} /> {p.display_address}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BottomTabBar />
    </div>
  )
}
