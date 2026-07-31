import { Link } from 'react-router-dom'
import { v3Text as t } from '../translations'
import './RealtorCTAV3.css'

// Stitch V3 시안 그대로: 한 줄짜리 저강조 배너 (독립된 헤딩/버튼 없음)
export default function RealtorCTAV3() {
  return (
    <section className="realtor-cta-v3">
      <p>
        {t.realtorCtaText}{' '}
        <Link to="/signup/realtor" className="realtor-cta-v3-link">{t.realtorCtaLink}</Link>
      </p>
    </section>
  )
}
