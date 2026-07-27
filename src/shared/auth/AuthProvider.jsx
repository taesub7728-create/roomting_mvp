import { createContext, useCallback, useEffect, useState } from 'react'
import { supabase } from '../../api/supabaseClient'
import { getCurrentProfile } from '../../api/auth.api'

// 앱 전체에서 user/profile을 단 한 번만 조회해서 공유하는 Context.
// (이전에는 페이지마다 각자 getCurrentProfile()을 독립 호출해서, 같은 화면 전환 안에서도
//  프로필을 여러 번 따로 불러오고 그 완료 시점이 서로 달라 레이스 컨디션이 생겼음)
//
// authLoading: 세션 복원이 끝났는지 (supabase auth 자체의 로딩 상태)
// profileLoading: authLoading이 끝난 뒤, profiles 테이블 조회가 끝났는지
// 두 로딩을 분리하는 이유: "세션 확인 완료 → user 존재 확인 → profile 조회 시작 → profile 완료"
// 순서가 실제로는 서로 다른 두 비동기 작업이라 하나로 뭉치면 중간 상태를 표현할 수 없음.
export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)

  // API 레이어(어떻게 가져오는지)는 auth.api.js의 기존 함수를 그대로 재사용하고,
  // 이 Provider는 그 결과를 상태로 보관해서 앱 전체에 공유하는 역할만 한다.
  const loadProfile = useCallback(async () => {
    setProfileLoading(true)
    const { data } = await getCurrentProfile()
    setProfile(data)
    setProfileLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    // onAuthStateChange는 구독 시점에 현재 세션 상태로 한 번 즉시 호출되고(INITIAL_SESSION),
    // 이후 로그인/로그아웃/토큰 갱신마다 다시 호출된다 - 세션 조회를 이 한 곳으로 통일해서
    // getSession()을 별도로 또 호출하는 중복 조회를 만들지 않는다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      setAuthLoading(false)

      if (sessionUser) {
        loadProfile()
      } else {
        setProfile(null)
        setProfileLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  return (
    <AuthContext.Provider value={{ user, profile, authLoading, profileLoading }}>
      {children}
    </AuthContext.Provider>
  )
}
