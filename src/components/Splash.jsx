import { useEffect, useState } from 'react'
import './Splash.css'

// 등장 시퀀스가 끝나고 전체 화면 페이드아웃을 시작하기까지의 시간
const SEQUENCE_MS = 2150
// 전체 화면 페이드아웃 길이 (총 노출 시간 = SEQUENCE_MS + FADE_OUT_MS ≈ 2.5s)
const FADE_OUT_MS = 350

const REQUEST_SUMMARY = '홍대입구 · 원룸 · 보증금 1,000 · 월세 80 이하'

const PROPOSALS = [
  { name: '행복부동산', type: '원룸', deposit: '500', rent: '45', location: '홍대입구역 · 도보 5분' },
  { name: '미래부동산', type: '오피스텔', deposit: '1,000', rent: '60', location: '신촌역 · 도보 3분' },
  { name: '한강부동산', type: '원룸', deposit: '300', rent: '40', location: '상수역 · 도보 7분' },
]

// 앱 콜드 스타트(첫 로드) 시에만 렌더되는 컴포넌트라, 탭 이동으로는 절대 재노출되지 않음
export default function Splash({ onFinish }) {
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    const outTimer = setTimeout(() => setFadingOut(true), SEQUENCE_MS)
    const doneTimer = setTimeout(onFinish, SEQUENCE_MS + FADE_OUT_MS)
    return () => { clearTimeout(outTimer); clearTimeout(doneTimer) }
  }, [onFinish])

  return (
    <div className={`splash${fadingOut ? ' splash-out' : ''}`}>
      <div className="splash-wordmark">Roomting</div>

      <h1 className="splash-headline">
        조건을 보내면,<br />부동산이 찾아와요
      </h1>

      <div className="splash-badge">여러 공인중개사가 24시간 안에 매물을 보내요</div>

      <div className="splash-phone-wrap">
        <div className="splash-phone">
          <div className="splash-screen">
            <div className="splash-statusbar">
              <span>9:41</span>
              <div className="splash-status-icons">
                <div className="splash-sig-bars"><span></span><span></span><span></span><span></span></div>
                <svg viewBox="0 0 14 10" fill="none" className="splash-wifi">
                  <path d="M1 3.5C4.5 0.5 9.5 0.5 13 3.5" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M3.2 5.8C5.5 4 8.5 4 10.8 5.8" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M5.6 8C6.5 7.3 7.5 7.3 8.4 8" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <div className="splash-batt"><i></i></div>
              </div>
            </div>

            <div className="splash-app-header">
              <span className="splash-app-title">내 요청 현황</span>
              <div className="splash-bell">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 4.5c-2.9 0-5.2 2.3-5.2 5.2v2.6c0 .6-.2 1.1-.6 1.6l-1 1.2c-.5.6-.1 1.5.6 1.5h13.6c.7 0 1.1-.9.6-1.5l-1-1.2c-.4-.5-.6-1-.6-1.6V9.7c0-2.9-2.3-5.2-5.2-5.2z" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 18.5a2 2 0 004 0" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <div className="splash-bell-badge">
                  <span className="splash-bc splash-bc-1">1</span>
                  <span className="splash-bc splash-bc-2">2</span>
                  <span className="splash-bc splash-bc-3">3</span>
                </div>
                <svg className="splash-sparkle" viewBox="0 0 20 20" fill="none">
                  <path d="M10 0c0 4 1 7 2.5 8.5C14 10 17 10 17 10c-4 0-7 1-8.5 2.5C7 14 7 17 7 17c0-4-1-7-2.5-8.5C3 7 0 7 0 7c4 0 7-1 8.5-2.5C10 3 10 0 10 0z" />
                </svg>
              </div>
            </div>

            <div className="splash-summary-card">
              <div className="splash-summary-status">
                <span className="splash-summary-dot"></span>
                부동산에 요청을 보냈어요
              </div>
              <div className="splash-summary-condition">{REQUEST_SUMMARY}</div>
            </div>

            <div className="splash-proposals">
              {PROPOSALS.map((p, i) => (
                <div className={`splash-proposal splash-proposal-${i + 1}`} key={p.name}>
                  <div className="splash-proposal-thumb">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M4 11.5L12 5l8 6.5M6 10v8.5a1 1 0 001 1h3v-5h4v5h3a1 1 0 001-1V10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="splash-proposal-body">
                    <div className="splash-proposal-top">
                      <div className="splash-proposal-title-group">
                        <span className="splash-proposal-name">{p.name}</span>
                        <span className="splash-proposal-type">{p.type}</span>
                      </div>
                      <span className="splash-proposal-new">NEW</span>
                    </div>
                    <div className="splash-proposal-price">보증금 {p.deposit} · 월세 {p.rent}만원</div>
                    <div className="splash-proposal-location">{p.location}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="splash-home-indicator"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
