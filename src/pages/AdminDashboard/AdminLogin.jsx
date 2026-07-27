import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { signInWithEmail, signOut, getCurrentProfile } from '../../api/auth.api'
import { useAuth } from '../../shared/auth/useAuth'
import { homePathForRole } from '../../shared/auth/homePathForRole'
import logo from '../../assets/roomting-symbol.svg'
import '../Login/Login.css'

// 관리자 전용 로그인. 로그인 자체는 성공해도 role이 admin이 아니면 그 자리에서 즉시 로그아웃시킨다
// (AdminRoute도 동일한 조건에서 signOut() 하지만, 여기서는 로그인 시도 시점에 바로 명확한 안내를 준다)
export default function AdminLogin() {
  const navigate = useNavigate()
  const { user, profile, authLoading, profileLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // 이미 로그인 + profile까지 확정된 사용자에게는 로그인 폼을 아예 보여주지 않는다
  if (authLoading || profileLoading) return null
  if (user && profile) return <Navigate to={homePathForRole(profile.role)} replace />

  async function handleLogin() {
    setError(null)
    setLoading(true)

    const { error: signInError } = await signInWithEmail({ email: email.trim(), password })
    if (signInError) { setLoading(false); setError(signInError); return }

    const { data: profile } = await getCurrentProfile()
    if (profile?.role !== 'admin') {
      await signOut()
      setLoading(false)
      setError('관리자 계정이 아니에요.')
      return
    }

    setLoading(false)
    navigate('/admin', { replace: true })
  }

  return (
    <div className="frame">
      <div style={{ padding: '18px 24px 0' }}>
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting admin</span>
        </div>
      </div>

      <div className="login-wrap">
        <div className="login-title"><Lock size={18} strokeWidth={2} style={{ verticalAlign: -3, marginRight: 6 }} />관리자 로그인</div>

        <div className="login-form">
          <input
            className="rt-input"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="rt-input"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="rt-error-text" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="rt-btn-primary" disabled={loading || !email || !password} onClick={handleLogin}>
          {loading ? '로그인하는 중...' : '로그인'}
        </button>
      </div>
    </div>
  )
}
