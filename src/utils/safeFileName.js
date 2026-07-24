// Supabase Storage는 파일 경로(key)에 한글 등 비-ASCII 문자가 섞이면 "Invalid key" 에러를 냄
// 원본 파일명 대신 확장자만 남기고 나머지는 안전한 문자로 새로 만들어서 사용
export function safeFileName(file) {
  const dotIndex = file.name.lastIndexOf('.')
  const ext = dotIndex > -1 ? file.name.slice(dotIndex + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const random = Math.random().toString(36).slice(2, 8)
  return ext ? `${Date.now()}-${random}.${ext}` : `${Date.now()}-${random}`
}
