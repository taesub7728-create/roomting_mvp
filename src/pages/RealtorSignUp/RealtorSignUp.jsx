import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { signUpWithEmail, signInWithEmail } from '../../api/auth.api'
import { checkLandlineDuplicate, submitRealtorApplication } from '../../api/realtorApplication.api'
import { useAuth } from '../../shared/auth/useAuth'
import { homePathForRole } from '../../shared/auth/homePathForRole'
import logo from '../../assets/roomting-symbol.svg'
import '../Login/Login.css'
import './RealtorSignUp.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// initialMode: 'apply'(기본, /signup/realtor) | 'login'(/login/realtor - 로그인 화면으로 바로 진입)
export default function RealtorSignUp({ initialMode = 'apply' }) {
  const navigate = useNavigate()
  const { user, profile, authLoading, profileLoading } = useAuth()

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
      role: 'customer', // role은 항상 customer로 생성됨(서버가 강제). "심사중" 여부는 realtor_applications 존재로 판단
      preferredLanguage: 'ko',
    })
    if (signUpError) { setLoading(false); setError(signUpError); return }

    if (!data?.session) {
      // ★ fail-safe 분기. 정상 운영에서는 도달하지 않는다.
      //
      // Supabase 프로젝트의 "Confirm email" 설정이 켜져 있으면 signUp()이 세션 없이
      // 반환한다. 그러면 아래 submitRealtorApplication() 이 실행되지 않아
      // realtor_applications 행도, 서류 업로드도 일어나지 않는다.
      // 즉 **계정만 만들어지고 지원서는 접수되지 않는다.**
      //
      // ★ 이 상태에서 사용자가 할 수 있는 복구 방법이 코드에 없다.
      //   submitRealtorApplication() 의 호출부는 아래 한 곳뿐이고 그 앞에 signUpWithEmail()
      //   이 있어서, 인증을 마친 뒤 같은 폼을 다시 제출해도 이미 가입된 이메일이라
      //   여기로 되돌아온다. 그래서 "로그인하면 이어서 제출할 수 있다"고 안내하지 않는다
      //   (2026-08-11 이전 문구가 그렇게 안내하고 있었고, 존재하지 않는 흐름이었다).
      //
      // 운영 계약: Confirm email = OFF 유지. ON 으로 바꾸려면 가입/지원 분리 구조 개편이
      // 선행되어야 한다. 자세한 내용은 TODO_PHASE2.md 「Auth 운영 계약」 참고.
      //
      // ★ 분기를 지우지 않는 이유: 설정이 실수로 ON 이 되면 이 화면이 "지원서가 접수되지
      //   않았다"는 사실을 알리는 유일한 장치다. 지우면 사용자는 접수된 줄 알고 기다린다.
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
    setLoginLoading(false)
    if (err) { setLoginError(err); return }

    // 파트너 로그인 화면이므로 role과 무관하게 항상 /realtor로 보냄
    // (role은 이제 승인 전까지 customer로 유지되므로, "심사중"인지 "권한 없음"인지는
    // RealtorDashboard가 realtor_applications 존재 여부로 직접 판단함)
    navigate('/realtor')
  }

  if (mode === 'login') {
    // 이미 로그인 + profile까지 확정된 사용자에게는 로그인 폼을 아예 보여주지 않는다
    if (authLoading || profileLoading) return null
    if (user && profile) return <Navigate to={homePathForRole(profile.role)} replace />

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
            <span onClick={() => setMode('apply')} style={{ cursor: 'pointer', color: 'var(--coral)', fontWeight: 700 }}>
              아직 지원하지 않으셨나요? 지원서 작성하기
            </span>
          </div>
          <div className="login-signup-link">
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={13} strokeWidth={2} /> 로그인 유형 다시 선택하기</Link>
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

  // ★ fail-safe 화면. Confirm email = OFF 인 정상 운영에서는 도달하지 않는다(handleSubmit 주석 참고).
  //   문구가 지켜야 하는 것 4가지:
  //     - 접수됐다고 오해시키지 않는다 (위 submitted 화면과 확실히 달라야 한다)
  //     - 서류가 올라갔다고 오해시키지 않는다
  //     - 존재하지 않는 재개 경로를 안내하지 않는다
  //     - 같은 폼을 다시 제출하도록 유도하지 않는다 (다시 제출해도 여기로 돌아온다)
  if (awaitingEmailConfirm) {
    return (
      <div className="frame">
        <div className="rsu-done">
          <div className="rsu-done-icon-wrap"><img src={logo} alt="roomting" /></div>
          <div className="rsu-done-title">지원서가 접수되지 않았어요</div>
          <div className="rsu-done-sub">계정은 만들어졌지만, 이메일 인증이 필요한 설정이라 지원서와 서류는 저장되지 않았어요.{'\n'}같은 내용으로 다시 제출해도 접수되지 않으니 고객센터로 문의해주세요.</div>
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
          <span onClick={() => setMode('login')} style={{ cursor: 'pointer', color: 'var(--coral)', fontWeight: 700 }}>
            이미 계정이 있으신가요? 로그인
          </span>
        </div>
        <div className="rsu-link">
          <Link to="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={13} strokeWidth={2} /> 가입 유형 다시 선택하기</Link>
        </div>
      </div>
    </div>
  )
}
