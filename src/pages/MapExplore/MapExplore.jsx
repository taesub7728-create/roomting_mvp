import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { getCurrentProfile } from '../../api/auth.api'
import { listPublicProperties } from '../../api/properties.api'
import { getOrCreatePropertyChatRoom } from '../../api/chat.api'
import { getRoomTypeLabel } from '../../utils/roomTypeLabel'
import { loadKakaoMaps } from '../../lib/kakaoMaps'
import { mapText } from './translations'
import './MapExplore.css'

const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 }

function thumbnailUrl(property) {
  if (!property.property_images?.length) return null
  return [...property.property_images].sort((a, b) => a.sort_order - b.sort_order)[0].image_url
}

export default function MapExplore() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = mapText[lang]

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])

  const [profile, setProfile] = useState(undefined) // undefined = 로딩중, null = 미로그인
  const [properties, setProperties] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: profileData } = await getCurrentProfile()
      setProfile(profileData ?? null)
      if (!profileData) return

      const { data, error: listError } = await listPublicProperties()
      if (listError) setError(listError)
      else setProperties(data)
    }
    load()
  }, [])

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
      kakao.maps.event.addListener(marker, 'click', () => setSelected(p))
      markersRef.current.push(marker)
      bounds.extend(position)
    })
    mapRef.current.setBounds(bounds)
  }, [mapReady, properties])

  async function handleContact() {
    if (!selected) return
    setConnecting(true)
    const { error: chatError } = await getOrCreatePropertyChatRoom(selected.id)
    setConnecting(false)
    if (chatError) { setError(chatError); return }
    navigate(`/chat/${selected.id}`)
  }

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
      <div className="top-bar">
        <Link className="back-btn" to="/">←</Link>
        <div className="top-title">{t.title}</div>
      </div>

      <div className="me-map" ref={mapContainerRef}>
        {error && <div className="me-overlay-badge me-error-badge">{error}</div>}
        {!error && mapReady && properties.length === 0 && (
          <div className="me-overlay-badge">{t.emptyText}</div>
        )}
      </div>

      {selected && (
        <div className="me-sheet">
          <button className="me-sheet-close" onClick={() => setSelected(null)}>✕</button>
          <div className="me-sheet-img">
            {thumbnailUrl(selected) ? <img src={thumbnailUrl(selected)} alt={selected.title} /> : '🏠'}
          </div>
          <div className="me-sheet-body">
            <div className="me-sheet-title">{selected.title}</div>
            <div className="me-sheet-addr">{selected.display_address}</div>
            <div className="me-sheet-price">
              {t.rentLabel} {Number(selected.monthly_rent ?? 0).toLocaleString()}만원
              <span className="me-sheet-deposit">{t.depositLabel} {Number(selected.deposit ?? 0).toLocaleString()}만원</span>
            </div>
            <span className="me-sheet-tag">{getRoomTypeLabel(lang, selected.room_type)}</span>
            <button className="rt-btn-primary" disabled={connecting} onClick={handleContact}>
              {connecting ? t.connecting : t.contactBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
