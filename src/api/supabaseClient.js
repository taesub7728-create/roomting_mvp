import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // .env 파일이 없거나 키가 비어있으면 앱 실행 즉시 원인을 알 수 있게 에러를 던짐
  throw new Error(
    'Supabase 환경변수가 없습니다. 프로젝트 루트에 .env 파일을 만들고 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 값을 채워주세요 (.env.example 참고).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
