import { createContext, useContext, useEffect, useState } from 'react'
import { updatePreferredLanguage } from '../api/auth.api'

// 화면 전체(랜딩, 회원가입 등)가 공유하는 "현재 UI 언어" 상태.
// 프로토타입의 localStorage 기반 언어 저장 방식을 그대로 유지 - 새로고침해도 언어가 유지됨
const LanguageContext = createContext(null)

const STORAGE_KEY = 'roomting_lang'
const SUPPORTED_LANGS = ['ko', 'ja', 'zh', 'en']

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return SUPPORTED_LANGS.includes(saved) ? saved : 'ko'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  const setLang = (code) => {
    if (!SUPPORTED_LANGS.includes(code)) return
    setLangState(code)
    // 로그인 중이면 채팅 자동번역이 기준으로 삼는 프로필 언어도 같이 맞춰줌.
    // 실패해도 화면 언어 자체는 이미 바뀐 상태라 조용히 무시함 (배경 동기화라 에러 알림 불필요)
    updatePreferredLanguage(code).catch(() => {})
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage는 LanguageProvider 안에서만 사용할 수 있습니다')
  return ctx
}
