import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signUpWithEmail, signInWithEmail, getCurrentProfile } from '../../api/auth.api'
import { checkLandlineDuplicate, submitRealtorApplication } from '../../api/realtorApplication.api'
import { redirectForRole } from '../../utils/redirectForRole'
import logo from '../../assets/roomting-symbol.svg'
import '../Login/Login.css'
import './RealtorSignUp.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// initialMode: 'apply'(기본, /signup/realtor) | 'login'(/login/realtor - 로그인 화면으로 바로 진입)
export default function RealtorSignUp({ initialMode = 'apply' }) {
  const navigate = useNavigate()

  const [mode, setMode] = useState(initialMode) // 'apply' | 'login'
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [landlinePhone, setLandlinePhone] = useState('')
  const [brokerRegistrationNumber, setBrokerRegistrationNumber] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [businessDocumentFile, setBusinessDocumentFile] = useState(null)
  const [brokerDocumentFile, setBrokerDocumentFile] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false)

  const canSubmit =
    EMAIL_RE.test(email.trim()) && password.length >= 6 &&
    companyName.trim() && businessRegistrationNumber.trim() &&
    contactName.trim() && contactPhone.trim() && landlinePhone.trim() &&
    brokerRegistrationNumber.trim() && companyAddress.trim() &&
    businessDocumentFile && brokerDocumentFile

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    const { data: isDuplicate, error: dupError } = await checkLandlineDuplicate(landlinePhone.trim())
    if (dupError) { setLoading(false); setError(dupError); return }
    if (isDuplicate) { setLoading(false); setError('이미 등록된 업체예요. 같은 유선전화번호로는 중복 가입할 수 없어요.'); return }

    const { data, error: signUpError } = await signUpWithEmail({
      email: email.trim(),
      password,
      nickname: companyName.trim(),
      role: 'pending_realtor',
      preferredLanguage: 'ko',
    })
    if (signUpError) { setLoading(false); setError(signUpError); return }

    if (!data?.session) {
      // Supabase 프로젝트의 "이메일 확인" 설정이 켜져 있으면 세션 없이 가입만 됨 - 서류는 로그인 후 다시 제출해야 함
      setLoading(false)
      setAwaitingEmailConfirm(true)
      return
    }

    const { error: applyError } = await submitRealtorApplication({
      companyName: companyName.trim(),
      businessRegistrationNumber: businessRegistrationNumber.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      landlinePhone: landlinePhone.trim(),
      brokerRegistrationNumber: brokerRegistrationNumber.trim(),
      companyAddress: companyAddress.trim(),
      businessDocumentFile,
      brokerDocumentFile,
    })
    setLoading(false)
    if (applyError) { setError(applyError); return }
    setSubmitted(true)
  }

  async function handleLogin() {
    setLoginError(null)
    setLoginLoading(true)
    const { error: err } = await signInWithEmail({ email: loginEmail.trim(), password: loginPassword })
    if (err) { setLoginLoading(false); setLoginError(err); return }

    const { data: profile } = await getCurrentProfile()
    setLoginLoading(false)
    redirectForRole(navigate, profile?.role)
  }

  if (mode === 'login') {
    return (
      <div className="frame">
        <div style={{ padding: '18px 24px 0' }}>
          <div className="rt-logo">
            <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
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
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
            <input
              className="rt-input"
              type="password"
              placeholder="비밀번호"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
          </div>

          {loginError && <div className="rt-error-text" style={{ marginBottom: 12 }}>{loginError}</div>}

          <button className="rt-btn-primary" disabled={loginLoading || !loginEmail || !loginPassword} onClick={handleLogin}>
            로그인
          </button>

          <div className="login-signup-link" style={{ marginTop: 18 }}>
            <span onClick={() => setMode('apply')} style={{ cursor: 'pointer', color: 'var(--pink)', fontWeight: 700 }}>
              아직 지원하지 않으셨나요? 지원서 작성하기
            </span>
          </div>
          <div className="login-signup-link">
            <Link to="/login">← 로그인 유형 다시 선택하기</Link>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="frame">
        <div className="rsu-done">
          <div className="rsu-done-icon-wrap"><img src={logo} alt="roomting" /></div>
          <div className="rsu-done-title">지원서를 접수했어요</div>
          <div className="rsu-done-sub">담당자 확인 후 승인되면 파트너 로그인이 가능해요.{'\n'}영업일 기준 1~2일 정도 걸릴 수 있어요.</div>
          <button className="rt-btn-primary" onClick={() => navigate('/')}>홈으로 돌아가기</button>
        </div>
      </div>
    )
  }

  if (awaitingEmailConfirm) {
    return (
      <div className="frame">
        <div className="rsu-done">
          <div className="rsu-done-icon-wrap"><img src={logo} alt="roomting" /></div>
          <div className="rsu-done-title">이메일 인증이 필요해요</div>
          <div className="rsu-done-sub">받으신 메일의 링크로 인증 후, 파트너 로그인으로 다시 로그인하면 서류 제출을 이어갈 수 있어요.</div>
          <button className="rt-btn-primary" onClick={() => navigate('/')}>홈으로 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="frame">
      <div style={{ padding: '18px 24px 0' }}>
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting partners</span>
        </div>
      </div>

      <div className="rsu-wrap">
        <div className="slide-eyebrow">공인중개사·에이전트 지원</div>
        <div className="slide-title">사업자 정보를 입력해주세요</div>
        <div className="slide-sub">제출하신 정보는 승인 심사에만 사용돼요</div>

        <div className="rsu-field">
          <label className="input-label">이메일</label>
          <input className="rt-input" type="email" placeholder="로그인에 사용할 이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">비밀번호</label>
          <input className="rt-input" type="password" placeholder="6자 이상" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">업체명</label>
          <input className="rt-input" type="text" placeholder="예) 위너스공인중개사사무소" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">사업자등록번호</label>
          <input className="rt-input" type="text" placeholder="000-00-00000" value={businessRegistrationNumber} onChange={(e) => setBusinessRegistrationNumber(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">유선전화번호</label>
          <input className="rt-input" type="tel" placeholder="숫자만 입력 (중복가입 확인용)" value={landlinePhone} onChange={(e) => setLandlinePhone(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">중개등록번호</label>
          <input className="rt-input" type="text" placeholder="중개사무소 등록번호를 입력해주세요" value={brokerRegistrationNumber} onChange={(e) => setBrokerRegistrationNumber(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">주소</label>
          <input className="rt-input" type="text" placeholder="중개업소 주소" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">담당자명</label>
          <input className="rt-input" type="text" placeholder="실제 업무를 담당하실 분 성함" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">연락처</label>
          <input className="rt-input" type="tel" placeholder="010-0000-0000" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
        <div className="rsu-field">
          <label className="input-label">사업자등록증 첨부</label>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setBusinessDocumentFile(e.target.files?.[0] || null)} />
          {businessDocumentFile && <div className="rsu-file-name">{businessDocumentFile.name}</div>}
        </div>
        <div className="rsu-field">
          <label className="input-label">중개등록증 첨부</label>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setBrokerDocumentFile(e.target.files?.[0] || null)} />
          {brokerDocumentFile && <div className="rsu-file-name">{brokerDocumentFile.name}</div>}
        </div>

        {error && <div className="rt-error-text">{error}</div>}

        <button className="rt-btn-primary" style={{ marginTop: 8 }} disabled={!canSubmit || loading} onClick={handleSubmit}>
          {loading ? '제출하는 중...' : '지원서 제출하기'}
        </button>

        <div className="rsu-link">
          <span onClick={() => setMode('login')} style={{ cursor: 'pointer', color: 'var(--pink)', fontWeight: 700 }}>
            이미 계정이 있으신가요? 로그인
          </span>
        </div>
        <div className="rsu-link">
          <Link to="/signup">← 가입 유형 다시 선택하기</Link>
        </div>
      </div>
    </div>
  )
}
