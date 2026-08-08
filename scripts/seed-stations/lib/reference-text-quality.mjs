// 참조 텍스트(외부 CSV에서 그대로 옮겨 오는 고유명사류) 손상 판정 - 공용.
//
// ★ 왜 공용인가 (2026-08-09/10 진단)
//   railway-standard.mjs(전체_도시철도역사정보)와 seoul-metro-i18n.mjs(역명다국어표기)는
//   서로 다른 파일이지만 같은 종류의 원본 손상을 갖는다 - EUC-KR/CP949로 옮길 수 없는
//   한자/중국어 문자가 원본 CSV 발행 단계에서 이미 ASCII '?'(0x3F)로 대체된 상태다.
//   두 파일 모두 전체를 EUC-KR로 디코딩하면 U+FFFD 0건이다(디코더 실패가 아니라
//   원본 데이터 자체의 손실 - byte-level로 확인됨, 어떤 인코딩으로 다시 읽어도
//   0x3F는 항상 ASCII '?'다). 판정 기준이 두 source에서 완전히 동일하므로
//   여기 하나로 뽑는다.
//
// ★ 여기 없는 것: 컬럼 매핑/조인 키 계산/행 파싱 같은 source별 로직은 옮기지 않는다.
//   이 파일은 "이 문자열 값을 신뢰할 수 있는가"만 판정한다.
const REPLACEMENT_CHAR = '�'

export function isSuspiciousReferenceText(value) {
  if (!value) return false
  return value.includes(REPLACEMENT_CHAR) || value.includes('?')
}
