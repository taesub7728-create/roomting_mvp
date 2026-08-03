// 원화 금액(만원 단위 정수) 파싱/표시 전용 유틸.
// 사용처: RequestWizard, ResponseStatus/RealtorDashboard/RealtorRespond의 전세 표시.
// 다른 화면(PropertyDetail, MapExplore 등)의 기존 "만원" 하드코딩은 이번 범위에 포함하지 않는다.

// 사용자 입력 문자열/숫자 → 만원 단위 정수. 콤마/공백 제거, 숫자가 아니면 null.
export function parseAmountInput(rawInput) {
  if (rawInput == null) return null
  const digitsOnly = String(rawInput).replace(/[,\s]/g, '')
  if (digitsOnly === '' || !/^\d+$/.test(digitsOnly)) return null
  return Number(digitsOnly)
}

const EOK_UNIT = { ko: '억', ja: '億', zh: '亿' }
const MAN_SUFFIX = { ko: '만원', ja: '万ウォン', zh: '万韩元' }
const WON_SUFFIX = { ko: '원', ja: 'ウォン', zh: '韩元' }
// ko만 "1억 5,000만원"처럼 억과 만 사이에 띄어쓰기가 들어간다(ja/zh는 "1億5,000万ウォン" 붙여쓰기)
const EOK_MAN_SEPARATOR = { ko: ' ', ja: '', zh: '' }

// 만원 단위 정수 → 언어별 표시 문자열
// ko/ja/zh: 억(億/亿) + 만 단위로 분해해서 표기, en: 환산 원화 총액을 콤마 포함 표기
export function formatKrwAmount(amountInManwon, locale) {
  if (amountInManwon == null || Number.isNaN(amountInManwon)) return ''

  if (locale === 'en') {
    return `KRW ${(amountInManwon * 10000).toLocaleString('en-US')}`
  }

  const eokUnit = EOK_UNIT[locale] ?? EOK_UNIT.ko
  const manSuffix = MAN_SUFFIX[locale] ?? MAN_SUFFIX.ko
  const wonSuffix = WON_SUFFIX[locale] ?? WON_SUFFIX.ko
  const sep = EOK_MAN_SEPARATOR[locale] ?? EOK_MAN_SEPARATOR.ko

  const eok = Math.floor(amountInManwon / 10000)
  const man = amountInManwon % 10000

  if (eok === 0) return `${man.toLocaleString('en-US')}${manSuffix}`
  if (man === 0) return `${eok}${eokUnit}${wonSuffix}`
  return `${eok}${eokUnit}${sep}${man.toLocaleString('en-US')}${manSuffix}`
}
