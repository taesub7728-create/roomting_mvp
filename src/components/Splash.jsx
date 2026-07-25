import { useEffect, useState } from 'react'
import logo from '../assets/roomting-logo-symbol.png'
import './Splash.css'

const FADE_IN_MS = 700
const HOLD_MS = 1100
const FADE_OUT_MS = 500

// 앱 콜드 스타트(첫 로드) 시에만 렌더되는 컴포넌트라, 탭 이동으로는 절대 재노출되지 않음
export default function Splash({ onFinish }) {
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    const outTimer = setTimeout(() => setFadingOut(true), FADE_IN_MS + HOLD_MS)
    const doneTimer = setTimeout(onFinish, FADE_IN_MS + HOLD_MS + FADE_OUT_MS)
    return () => { clearTimeout(outTimer); clearTimeout(doneTimer) }
  }, [onFinish])

  return (
    <div className={`splash${fadingOut ? ' splash-out' : ''}`}>
      <div className="splash-mark"><img src={logo} alt="roomting" /></div>
      <div className="splash-word">roomting</div>
    </div>
  )
}
