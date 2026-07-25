import { useRef, useState } from 'react'
import './ImageCarousel.css'

const SWIPE_THRESHOLD_PX = 40

// 사진 여러 장을 좌우로 넘기는 캐러셀. Pointer Events를 써서 마우스 드래그(데스크톱)와
// 터치 스와이프(모바일/펜)를 하나의 핸들러로 처리함 - 터치 이벤트만 쓰면 마우스 환경에서 전혀 반응하지 않음
// 사진이 1장 이하면 도트/카운터 없이 그냥 보여줌.
// 카드처럼 바깥 요소가 클릭 가능한 경우, 드래그 동작이 그 클릭으로 이어지지 않도록 막아줌
export default function ImageCarousel({ images = [], placeholder = null, className = '' }) {
  const [index, setIndex] = useState(0)
  const startXRef = useRef(0)
  const draggingRef = useRef(false)
  const draggedRef = useRef(false)

  const count = images.length

  function handlePointerDown(e) {
    startXRef.current = e.clientX
    draggingRef.current = true
    draggedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    if (!draggingRef.current) return
    if (Math.abs(startXRef.current - e.clientX) > 10) draggedRef.current = true
  }

  function handlePointerUp(e) {
    if (!draggingRef.current) return
    draggingRef.current = false
    const diff = startXRef.current - e.clientX
    if (Math.abs(diff) > SWIPE_THRESHOLD_PX) {
      setIndex((prev) => Math.min(Math.max(prev + (diff > 0 ? 1 : -1), 0), count - 1))
    }
  }

  function handleClickCapture(e) {
    if (draggedRef.current) {
      e.stopPropagation()
      draggedRef.current = false
    }
  }

  if (count === 0) {
    return <div className={`img-carousel ${className}`}>{placeholder}</div>
  }

  return (
    <div
      className={`img-carousel ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
    >
      <div className="img-carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {images.map((url, i) => (
          <div className="img-carousel-slide" key={i}><img src={url} alt="" draggable={false} /></div>
        ))}
      </div>

      {count > 1 && (
        <>
          <div className="img-carousel-dots">
            {images.map((_, i) => (
              <span key={i} className={`img-carousel-dot${i === index ? ' active' : ''}`}></span>
            ))}
          </div>
          <div className="img-carousel-counter">{index + 1} / {count}</div>
        </>
      )}
    </div>
  )
}
