import { Home, Map, MessageCircle, User } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { tabBarText } from './BottomTabBar.translations'
import './BottomTabBar.css'

// 채팅 목록(받은함) 페이지가 아직 없어서, 우선 MY페이지로 연결해둠 (생기면 to/match만 바꾸면 됨)
const TABS = [
  { key: 'home', textKey: 'home', to: '/', icon: Home, match: (path) => path === '/' },
  { key: 'map', textKey: 'map', to: '/map', icon: Map, match: (path) => path.startsWith('/map') },
  { key: 'chat', textKey: 'chat', to: '/mypage', icon: MessageCircle, match: (path) => path.startsWith('/chat') },
  { key: 'my', textKey: 'my', to: '/mypage', icon: User, match: (path) => path.startsWith('/mypage') },
]

export default function BottomTabBar() {
  const { pathname } = useLocation()
  const { lang } = useLanguage()
  const t = tabBarText[lang]

  return (
    <nav className="tab-bar">
      {TABS.map(({ key, textKey, to, icon: Icon, match }) => {
        const active = match(pathname)
        return (
          <Link key={key} to={to} className={`tab-item${active ? ' active' : ''}`}>
            <span className="tab-icon"><Icon size={22} strokeWidth={2} /></span>
            <span className="tab-label">{t[textKey]}</span>
          </Link>
        )
      })}
    </nav>
  )
}
