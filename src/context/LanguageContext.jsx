import { createContext, useContext, useEffect, useState } from 'react'
import { updatePreferredLanguage } from '../api/auth.api'

// 화면 전체(랜딩, 회원가입 등)가 공유하는 "현재 UI 언어" 상태.
// 프로토타입의 localStorage 기반 언어 저장 방식을 그대로 유지 - 새로고침해도 언어가 유지됨
const LanguageContext = createContext(null)

const STORAGE_KEY = 'roomting_lang'
const SUPPORTED_LANGS = ['ko', 'ja', 'zh', 'en']

function normalizeToSupported(code) {
  if (typeof code !== 'string') return null
  const base = code.toLowerCase().split('-')[0]
  return SUPPORTED_LANGS.includes(base) ? base : null
}

function readStoredLang() {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return SUPPORTED_LANGS.includes(saved) ? saved : null
  } catch {
    return null // 사파리 프라이빗 모드 등 localStorage 접근이 막힌 환경
  }
}

// 외국인 대상 서비스라 최초 방문 폴백은 'ko'가 아니라 'en'.
// 우선순위: 저장된 값 → navigator.languages(브라우저 선호 순서) → navigator.language → 'en'
function detectInitialLanguage() {
  const stored = readStoredLang()
  if (stored) return stored

  if (typeof navigator === 'undefined') return 'en'
  const candidates = [...new Set([
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter(Boolean))]

  for (const candidate of candidates) {
    const normalized = normalizeToSupported(candidate)
    if (normalized) return normalized
  }
  return 'en'
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLanguage)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // 저장 실패해도 화면 언어 자체는 이미 바뀐 상태라 조용히 무시
    }
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
