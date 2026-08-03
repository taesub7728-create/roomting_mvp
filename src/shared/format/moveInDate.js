// 로컬(브라우저) 타임존 기준 날짜 유틸. new Date().toISOString()은 UTC로 변환되므로
// 쓰지 않는다 - UTC보다 시간이 느린 타임존에서 자정 근처에 하루가 밀려 보일 수 있다.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 로컬 타임존 기준 "오늘"을 'YYYY-MM-DD'로 만든다.
export function getLocalTodayISO() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 형식 + 실존 여부만 검사한다(과거 여부는 isPastLocalDate의 책임).
// new Date(y, m-1, d)는 2월 30일 같은 존재하지 않는 날짜를 다음 달로 자동 보정해버리므로,
// 생성된 Date를 다시 분해해 입력값과 정확히 일치하는지 역으로 확인해 그 보정을 감지한다.
export function isValidLocalISODate(dateStr) {
  if (typeof dateStr !== 'string' || !ISO_DATE_RE.test(dateStr)) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

// dateStr이 이미 isValidLocalISODate를 통과한 유효한 'YYYY-MM-DD'라고 가정한다(형식 검증은
// 호출부 책임). 둘 다 zero-padded 'YYYY-MM-DD'라 사전식 문자열 비교가 곧 날짜 순서 비교와
// 동일하다 - Date 객체로 재파싱하지 않아 타임존 변환 위험이 아예 없다.
export function isPastLocalDate(dateStr) {
  return dateStr < getLocalTodayISO()
}

// requests.move_in_date는 'YYYY-MM-DD' date 문자열이다. new Date(dateStr)로 바로 넘기면
// UTC 자정으로 해석되어, UTC보다 시간이 느린 타임존(미국 등)의 브라우저에서 하루 밀려 보일 수
// 있다 - 문자열을 연/월/일로 직접 분해해 로컬 타임존 생성자로 만들어서 이 문제를 피한다.
const LOCALES = { ko: 'ko-KR', ja: 'ja-JP', zh: 'zh-CN', en: 'en-US' }

export function formatMoveInDate(lang, dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  const locale = LOCALES[lang] || LOCALES.en
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}
