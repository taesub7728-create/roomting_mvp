import { useNavigate } from 'react-router-dom'
import logo from '../../assets/roomting-logo-symbol.png'
import './SignUpChoice.css'

export default function SignUpChoice() {
  const navigate = useNavigate()

  return (
    <div className="frame">
      <div style={{ padding: '18px 24px 0' }}>
        <div className="rt-logo">
          <div className="rt-logo-mark"><img src={logo} alt="roomting" /></div>
          <span className="rt-logo-name">roomting</span>
        </div>
      </div>

      <div className="sc-wrap">
        <div>
          <div className="slide-eyebrow">회원가입</div>
          <div className="slide-title">어떤 회원으로{'\n'}시작하시나요?</div>
          <div className="slide-sub">가입 유형에 따라 다음 단계가 달라져요</div>

          <div className="sc-choice-list">
            <button className="sc-choice-card" onClick={() => navigate('/signup/customer')}>
              <span className="sc-choice-emoji">🏠</span>
              <span className="sc-choice-title">일반회원으로 시작</span>
              <span className="sc-choice-desc">방을 구하고 있어요</span>
            </button>
            <button className="sc-choice-card" onClick={() => navigate('/signup/realtor')}>
              <span className="sc-choice-emoji">🏢</span>
              <span className="sc-choice-title">공인중개사·에이전트로 시작</span>
              <span className="sc-choice-desc">매물을 등록하고 싶어요</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
