import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { requestSuccessText } from './translations'
import './RequestSuccess.css'

// 조건 요청서 제출 성공의 공통 완료 화면 (직접 제출 / 로그인·가입 후 자동 제출 모두 여기로 옴)
export default function RequestSuccess() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const t = requestSuccessText[lang]

  return (
    <div className="frame request-success-frame">
      <div className="rs-icon-wrap">
        <CheckCircle2 size={34} strokeWidth={2} />
      </div>
      <div className="rs-title">{t.title}</div>
      <div className="rs-desc">{t.desc}</div>
      <div className="rs-actions">
        <button className="rt-btn-primary" onClick={() => navigate(`/requests/${requestId}`)}>
          {t.viewStatus}
        </button>
        <button className="rt-btn-secondary" onClick={() => navigate('/map')}>
          {t.moreOnMap}
        </button>
      </div>
    </div>
  )
}
