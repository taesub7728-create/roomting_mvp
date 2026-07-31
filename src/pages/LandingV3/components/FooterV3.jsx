import { v3Text as t } from '../translations'
import './FooterV3.css'

export default function FooterV3() {
  return (
    <footer className="v3-footer">
      {t.footerHelp} <a href="#">{t.footerContact}</a>
    </footer>
  )
}
