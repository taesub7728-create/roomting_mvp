import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { User, LogOut } from 'lucide-react'
import { getCurrentProfile, signOut } from '../../../api/auth.api'
import logo from '../../../assets/roomting-symbol.svg'
import { v3Text as t } from '../translations'
import './LandingV3Header.css'

// V1의 LandingHeader와 같은 로그인 상태 로직(그대로 재사용), 언어선택 드롭다운만 생략(단일 언어 검토용)
export default function LandingV3Header() {
  const [profileOpen, setProfileOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const profileBoxRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      const { data, error } = await getCurrentProfile()
      if (cancelled) return
      if (error) setProfileError(error)
      else setProfile(data)
    }
    loadProfile()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function handleOutsideClick(e) {
      if (profileBoxRef.current && !profileBoxRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])

  async function handleLogout() {
    const { error } = await signOut()
    if (error) {
      setProfileError(error)
      return
    }
    setProfile(null)
    setProfileOpen(false)
  }

  return (
    <header className="v3-header">
      <div className="v3-logo">
        <div className="v3-logo-mark"><img src={logo} alt="roomting" /></div>
        <span className="v3-logo-name">roomting</span>
      </div>

      {profile ? (
        <div className="v3-profile-box" ref={profileBoxRef}>
          <button className="v3-profile-btn" onClick={() => setProfileOpen((v) => !v)}>
            {(profile.nickname || '?').charAt(0).toUpperCase()}
          </button>
          <div className={`v3-profile-dd${profileOpen ? ' open' : ''}`}>
            <Link to="/mypage" onClick={() => setProfileOpen(false)}><User size={16} strokeWidth={2} /> 마이페이지</Link>
            <div className="v3-dd-logout" onClick={handleLogout}><LogOut size={16} strokeWidth={2} /> 로그아웃</div>
          </div>
        </div>
      ) : (
        <div className="v3-auth-links">
          <Link className="v3-login-link" to="/login">{t.login}</Link>
          <Link className="v3-signup-link" to="/signup">{t.signup}</Link>
        </div>
      )}

      {profileError && <div className="rt-error-text" style={{ padding: '0 22px' }}>{profileError}</div>}
    </header>
  )
}
