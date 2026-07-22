import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmail, getCurrentProfile } from '../../api/auth.api'
import '../Login/Login.css'

// 공인중개사·에이전트 전용 로그인 화면. 소비자용 /login과 URL만 분리(디자인 톤은 동일)
// 계정은 지금 단계에서 자체 가입이 아니라 운영자가 직접 만들어주는 방식이라 소셜 로그인/가입 버튼 없음
export default function PartnerLogin() {
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

    const { data: profile } = await getCurrentProfile()
    setLoading(false)

    if (profile?.role === 'realtor' || profile?.role === 'care_agent') {
      navigate('/realtor')
    } else {
      // 고객 계정이 실수로 파트너 로그인으로 들어온 경우
      navigate('/')
    }
  }

  return (
    <div className="frame">
      <div className="top-logo" style={{ padding: '18px 24px 0' }}>
        <div className="rt-logo">
          <span className="rt-logo-name">roomting partners</span>
        </div>
      </div>

      <div className="login-wrap">
        <div className="login-title">공인중개사 · 에이전트 로그인</div>

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

        <div className="login-signup-link" style={{ marginTop: 18 }}>
          아직 계정이 없으신가요? 가입 문의는 고객센터로 연락해주세요.
        </div>
        <div className="login-signup-link">
          <Link to="/login">일반 회원이신가요? 고객 로그인</Link>
        </div>
      </div>
    </div>
  )
}
