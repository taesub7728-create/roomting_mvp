import { toFriendlyError } from './errors'

const API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY

// 룸팅에서 쓰는 언어 코드('zh')를 Google Translate가 쓰는 코드('zh-CN')로 변환
const LANG_CODE_MAP = { zh: 'zh-CN' }
function toGoogleLangCode(code) {
  return LANG_CODE_MAP[code] || code
}

// 채팅 메시지 한 줄을 target 언어로 번역
// 번역 API 호출이라 실패할 수 있으므로, 실패해도 에러만 반환하고 앱이 멈추지 않게 함
// 참고: 지금은 브라우저에서 직접 이 키로 호출하는 방식(테스트용). 실제 출시 전에는
// 이 API 키 호출을 서버 함수(Supabase Edge Function)로 옮겨서 키가 노출되지 않게 해야 함
export async function translateText(text, targetLang) {
  if (!API_KEY) return { data: null, error: '번역 API 키가 설정되지 않았습니다.' }
  if (!text?.trim()) return { data: '', error: null }

  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: toGoogleLangCode(targetLang), format: 'text' }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || '번역 요청이 실패했습니다.' }

    const translated = json?.data?.translations?.[0]?.translatedText
    return { data: translated ?? null, error: translated ? null : '번역 결과를 받지 못했습니다.' }
  } catch (err) {
    return { data: null, error: toFriendlyError(err) }
  }
}
