import { useLanguage } from '../../../context/LanguageContext'
import { landingText } from '../translations'
import './Footer.css'

export default function Footer() {
  const { lang } = useLanguage()
  const t = landingText[lang]

  return (
    <footer className="landing-footer">
      {t.footerHelp} <a href="#">{t.footerContact}</a>
    </footer>
  )
}
