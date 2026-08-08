// --no-kakao(dry-run) 에서 override 를 적용 대상에서 빼는 결정 하나만 담당한다.
//
// dry-run 은 district 가 전부 미해결이라 fingerprint 가 실제 검수 시점과 절대 같을 수 없다
// (canonicalRowLine 에 district code 가 들어간다). dry-run 에 override 를 들이대면 항상 stale 이
// 되어 "파싱/병합만 빠르게 확인"이라는 --no-kakao 의 목적이 깨진다. 그래서 dry-run 에는 override
// 를 아예 넘기지 않는다 - README 의 "검수용이 아니다"와 같은 이유다.
//
// ★ run.mjs 는 최상위에서 main() 을 즉시 실행하는 스크립트라 selftest.mjs 가 직접 import 할 수
//   없다. 이 결정 하나를 별도 파일로 뽑아 둔 이유가 그것이다 - 회귀 테스트(selftest N1/N2)가
//   run.mjs 를 건드리지 않고도 "dry-run 에는 override 가 안 간다"는 계약을 고정할 수 있다.
export function overridesForRun(useKakao, overrides) {
  return useKakao ? overrides : []
}
