import { Link } from 'react-router-dom'
import { v3Text as t } from '../translations'
import './BrowseCTAV3.css'

// Stitch V3 시안 그대로: 버튼이 아니라 순수 텍스트 링크로 처리해서 Primary와 무게 차이를 극대화
export default function BrowseCTAV3() {
  return (
    <section className="browse-cta-v3">
      <Link className="browse-cta-v3-link" to="/map">{t.ctaBrowseTitle}</Link>
    </section>
  )
}
