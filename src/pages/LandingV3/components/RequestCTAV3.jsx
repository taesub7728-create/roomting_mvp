import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { v3Text as t } from '../translations'
import './RequestCTAV3.css'

export default function RequestCTAV3() {
  return (
    <section className="request-cta-v3">
      <Link className="request-cta-v3-btn" to="/request">
        <span>{t.ctaRequestTitle}</span>
        <ArrowRight size={19} strokeWidth={2.25} />
      </Link>
      <p className="request-cta-v3-trust">{t.trustLine}</p>
    </section>
  )
}
