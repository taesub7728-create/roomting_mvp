// candidate group(= normalize(main_name)) 을 가리키는 검수표 식별자.
// manual-review-inventory.mjs 와 merge.mjs(override 적용)가 반드시 이 함수 하나만 쓴다.
// 두 곳에서 각자 계산하면 언젠가 어긋난다.
//
// ★ DB id 도 override id 도 아니다. normalize(main_name) 의 순수 함수이며,
//   그룹 구성(행 수/identity/환승 여부)이 바뀌어도 이름이 같으면 값이 그대로다.
//   "이 그룹이 무엇을 가리키는가"만 안정적으로 식별하고, "그때 본 내용과 같은가"는
//   lib/fingerprint.mjs 의 groupFingerprint() 가 별도로 책임진다.
export function reviewId(normalizedName) {
  let h = 0x811c9dc5
  for (const ch of normalizedName) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `RV-${h.toString(16).padStart(8, '0')}`
}
