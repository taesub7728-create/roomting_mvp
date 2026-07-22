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

// 이미 가입된 계정으로 이메일/비밀번호 로그인
export async function signInWithEmail({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 소셜 로그인. provider: 'google' | 'kakao' | 'line'
// 클릭하면 브라우저가 해당 로그인 페이지로 이동했다가, 로그인 후 redirectTo 주소로 돌아옴
// 각 provider는 Supabase 대시보드 Authentication > Providers에서 활성화해야 실제로 동작함 (별도 단계에서 설정)
export async function signInWithOAuth(provider, redirectTo) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  })
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 소셜 로그인으로 돌아온 직후, profiles에 자동으로 채워진 임시 닉네임/언어를
// 사용자가 실제로 고른 값으로 다시 채워넣을 때 사용
export async function updateOwnProfile({ nickname, preferredLanguage }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인 상태를 확인할 수 없습니다.' }

  const { data, error } = await supabase
    .from('profiles')
    .update({ nickname, preferred_language: preferredLanguage })
    .eq('id', user.id)
    .select()
    .single()
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 화면 언어 선택 버튼을 바꿀 때, 로그인 중이면 실제 번역 기준 언어(preferred_language)도 같이 업데이트
export async function updatePreferredLanguage(preferredLanguage) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: null } // 로그인 안 한 상태면 그냥 무시 (화면 언어만 바뀌면 됨)

  const { error } = await supabase.from('profiles').update({ preferred_language: preferredLanguage }).eq('id', user.id)
  if (error) return { error: toFriendlyError(error) }
  return { error: null }
}

// 현재 로그인 세션이 있는지만 빠르게 확인 (소셜 로그인 후 돌아왔는지 판단할 때 사용)
export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
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
