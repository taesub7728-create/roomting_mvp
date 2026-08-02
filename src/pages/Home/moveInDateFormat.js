const LOCALES = { ko: 'ko-KR', ja: 'ja-JP', zh: 'zh-CN', en: 'en-US' }

// requests.move_in_date는 'YYYY-MM-DD' date 문자열이다. new Date(dateStr)로 바로 넘기면
// UTC 자정으로 해석되어, UTC보다 시간이 느린 타임존(미국 등)의 브라우저에서 하루 밀려 보일 수
// 있다 - 문자열을 연/월/일로 직접 분해해 로컬 타임존 생성자로 만들어서 이 문제를 피한다.
export function formatMoveInDate(lang, dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  const locale = LOCALES[lang] || LOCALES.en
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}
