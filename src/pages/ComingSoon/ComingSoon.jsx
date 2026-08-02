import { Link } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext'
import { comingSoonText } from './translations'

// 아직 구현되지 않은 화면(조건 요청서, 지도 탐색 등)으로 이동했을 때 보여주는 임시 화면
export default function ComingSoon() {
  const { lang } = useLanguage()
  const t = comingSoonText[lang]

  return (
    <div className="frame" style={{ alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 16 }}>
      <Construction size={40} strokeWidth={1.75} />
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{t.message}</p>
      <Link to="/" style={{ color: 'var(--coral)', fontWeight: 700, fontSize: 14 }}>{t.backHome}</Link>
    </div>
  )
}
