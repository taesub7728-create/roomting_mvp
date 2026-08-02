import symbolWhite from '../assets/roomting-symbol-white.svg'
import './Splash.css'

// 앱 콜드 스타트(첫 로드) 시에만 렌더되는 브랜드 모먼트.
// 전환 타이밍은 AppEntryGate가 준비 상태 기준으로 제어하고, 이 컴포넌트는 순수 표시만 담당한다.
export default function Splash({ fadingOut = false }) {
  return (
    <div className={`splash${fadingOut ? ' splash-out' : ''}`}>
      <img className="splash-symbol" src={symbolWhite} alt="" aria-hidden="true" />
      <div className="splash-wordmark">roomting</div>
    </div>
  )
}
