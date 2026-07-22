import { requestText } from '../pages/RequestWizard/translations'

// 방 타입 코드('one_room' 등)를 현재 언어의 화면 표시용 라벨로 변환
export function getRoomTypeLabel(lang, code) {
  const list = requestText[lang]?.roomTypes || requestText.ko.roomTypes
  return list.find((rt) => rt.code === code)?.label || code
}
