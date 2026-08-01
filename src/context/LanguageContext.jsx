import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { updatePreferredLanguage } from '../api/auth.api'
import { useAuth } from '../shared/auth/useAuth'

// 화면 전체(랜딩, 회원가입 등)가 공유하는 "현재 UI 언어" 상태.
// 프로토타입의 localStorage 기반 언어 저장 방식을 그대로 유지 - 새로고침해도 언어가 유지됨
const LanguageContext = createContext(null)

const STORAGE_KEY = 'roomting_lang'
// 비로그인 상태에서 언어를 바꿨다는 표시. 로그인 완료 시 이 값이 있으면
// DB의 예전 값을 UI로 끌어오는 대신, 방금 고른 로컬 값을 DB로 반영한다(1회).
const PENDING_KEY = 'roomting_lang_pending_sync'
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
  const { user, profile, profileLoading } = useAuth()
  const [lang, setLangState] = useState(detectInitialLanguage)

  // 이번 로그인 세션(user.id)에서 "DB → UI 초기 동기화"를 이미 처리했는지 기록.
  // 토큰 리프레시 등으로 profile이 다시 로드돼도 같은 로그인 세션이면 재실행하지 않는다 -
  // 그렇지 않으면 사용자가 막 바꾼 언어가 DB에 반영되기 전에 재조회가 끼어들어
  // 옛날 값으로 되돌리는 경합이 생길 수 있음(실제로 트레이스로 확인된 경로).
  const syncedUserIdRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // 저장 실패해도 화면 언어 자체는 이미 바뀐 상태라 조용히 무시
    }
  }, [lang])

  // 로그인 완료 후 DB(profiles.preferred_language) → UI 동기화.
  // 실행 순서: user 없음(로그아웃) → ref 리셋하고 종료 / profileLoading 중 → 종료 /
  // 이미 이 user로 동기화됨 → 종료 / 동기화 표시 후, pending flag 있으면 로컬값을 DB로
  // 1회 push하고 종료 / 없으면 유효한 DB 값을 setLangState(직접, setLang 아님)로 적용.
  useEffect(() => {
    const uid = user?.id ?? null

    if (!uid) {
      syncedUserIdRef.current = null
      return
    }
    if (profileLoading) return
    if (syncedUserIdRef.current === uid) return
    syncedUserIdRef.current = uid

    let pending = false
    try {
      pending = localStorage.getItem(PENDING_KEY) === '1'
    } catch {
      // 접근 불가 환경이면 pending 없는 것으로 간주하고 DB 값 적용 경로로 진행
    }

    if (pending) {
      try {
        localStorage.removeItem(PENDING_KEY)
      } catch {
        // 제거 실패해도 치명적이지 않음 - 다음 로그인 때 한 번 더 push될 뿐
      }
      updatePreferredLanguage(lang).catch(() => {})
      return
    }

    const dbLang = profile?.preferred_language
    if (dbLang && SUPPORTED_LANGS.includes(dbLang)) {
      setLangState((current) => {
        if (current === dbLang) return current
        try {
          localStorage.setItem(STORAGE_KEY, dbLang)
        } catch {
          // 저장 실패해도 화면 언어 자체는 이미 바뀐 상태라 조용히 무시
        }
        return dbLang
      })
    }
  }, [user?.id, profileLoading, profile?.preferred_language, lang])

  const setLang = (code) => {
    if (!SUPPORTED_LANGS.includes(code)) return
    setLangState(code)
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      // 저장 실패해도 화면 언어 자체는 이미 바뀐 상태라 조용히 무시
    }

    if (!user) {
      // 비로그인 상태 - 로그인 완료 시 이 값을 DB로 반영해야 함을 표시
      try {
        localStorage.setItem(PENDING_KEY, '1')
      } catch {
        // 표시 실패 시 로그인해도 DB 동기화가 안 될 수 있으나 화면 언어 자체는 정상 동작
      }
      return
    }

    // 사용자의 직접 선택이 로그인 프로필 pull보다 우선한다.
    // (트레이드오프: 이 로그인 세션에서 DB → UI 초기 pull은 이후 영구히 스킵됨 -
    //  즉 다른 기기에서 설정한 DB 언어가 "이번 세션"에는 반영되지 않는다.
    //  단, 지금 고른 값 자체가 아래 updatePreferredLanguage로 DB에 반영되므로
    //  결과적으로 DB도 최신 상태로 갱신된다.)
    syncedUserIdRef.current = user.id
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
