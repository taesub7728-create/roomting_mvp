import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmail, signInWithOAuth, getCurrentProfile } from '../../api/auth.api'
import logo from '../../assets/roomting-logo-symbol.png'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    const { error: loginError } = await signInWithEmail({ email: email.trim(), password })
    if (loginError) { setLoading(false); setError(loginError); return }

    // 공인중개사/에이전트 계정이 실수로 일반 로그인으로 들어온 경우, 알맞은 화면으로 보내줌
    const { data: profile } = await getCurrentProfile()
    setLoading(false)
    if (profile?.role === 'realtor' || profile?.role === 'care_agent' || profile?.role === 'pending_realtor') {
      navigate('/realtor')
    } else if (profile?.role === 'admin') {
      navigate('/admin')
    } else {
      navigate('/')
    }
  }

  async function handleOAuth(provider) {
    setError(null)
    setLoading(true)
    const { error: oauthError } = await signInWithOAuth(provider, `${window.location.origin}/`)
    if (oauthError) { setError(oauthError); setLoading(false) }
  }

  return (
    <div className="frame">
      <div className="top-logo" style={{ padding: '18px 24px 0' }}>
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
        </div>
      </div>

      <div className="login-wrap">
        <div className="login-title">다시 만나서 반가워요</div>

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
          로그인
        </button>

        <div className="divider">
          <div className="divider-line"></div>
          <div className="divider-text">또는</div>
          <div className="divider-line"></div>
        </div>

        <div className="social-btns">
          <button className="social-btn" disabled={loading} onClick={() => handleOAuth('google')}>
            <span className="social-icon">G</span><span>Google로 계속하기</span>
          </button>
          <button className="social-btn btn-kakao" disabled={loading} onClick={() => handleOAuth('kakao')}>
            <span className="social-icon">K</span><span>카카오로 계속하기</span>
          </button>
          <button className="social-btn btn-line" disabled={loading} onClick={() => handleOAuth('line')}>
            <span className="social-icon">L</span><span>라인으로 계속하기</span>
          </button>
        </div>

        <div className="login-signup-link">
          계정이 없으신가요? <Link to="/signup">가입하기</Link>
        </div>
        <div className="login-signup-link">
          공인중개사·에이전트이신가요? <Link to="/partner/login">파트너 로그인</Link>
        </div>
      </div>
    </div>
  )
}
