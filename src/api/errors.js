// Supabase 등 외부 서비스 호출 실패를, 사용자에게 보여줄 한국어 메시지로 바꿔주는 함수
// 모든 api 함수는 실패 시 에러를 던지지 않고 이 함수를 거친 문자열을 반환한다 (화면이 그냥 멈추지 않도록)
export function toFriendlyError(error) {
  if (!error) return null

  if (error.message?.includes('Failed to fetch')) {
    return '네트워크 연결을 확인해주세요.'
  }

  return error.message || '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
}
