import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// 회원가입: nickname/role/preferred_language는 profiles 테이블에 자동으로 채워짐
// (supabase/schema.sql의 handle_new_user 트리거 참고)
export async function signUpWithEmail({ email, password, nickname, role, preferredLanguage }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nickname, role, preferred_language: preferredLanguage },
    },
  })
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 소셜 로그인. provider: 'google' (카카오/라인은 Supabase에 커스텀 OAuth 프로바이더 설정 후 사용 가능 - 별도 단계에서 안내)
export async function signInWithOAuth(provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider })
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) return { error: toFriendlyError(error) }
  return { error: null }
}

// 현재 로그인한 사람의 profiles 행(닉네임, role 등)을 가져옴
export async function getCurrentProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: null }

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}
