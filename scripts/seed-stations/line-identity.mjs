// line identity — 병합 판정과 대표 좌표 선택의 단일 기준.
//
// 채택 모델:  raw source data → line identity → (향후) display line
//   이번 단계는 line identity 까지만 구현한다. 사용자에게 보여줄 노선명(1호선/공항철도 등)은
//   여기 넣지 않는다. lines 테이블 시드 시점의 별도 관심사다.
//
// 기본값은 source 노선번호다. 원천 데이터가 하나의 노선번호에 두 개 이상의 실체를 담은
// 경우에만 아래 reference rule 로 분리한다. 역명으로 분기하지 않는다.
//
// ─────────────────────────────────────────────────────────────────────
// [재검토 조건] 아래 중 하나라도 해당하면 raw → source → service 3계층 도입을 재검토한다.
//   (a) 동일 source identity 가 여러 service identity 로 갈리는 패턴이
//       서로 다른 source line 에서 반복될 때
//   (b) segment/reference mapping 이 서로 다른 source line 에서 3개 이상으로 늘어날 때
//   (c) 동일 service identity 해석을 merge 뿐 아니라 검색·표시·라우팅 등
//       2개 이상의 기능이 공유해야 할 때
//
// 숫자만으로 자동 승격하지 않는다. 예외가 4개여도 서로 독립된 단순 source-data quirk 면
// 현 방식이 낫고, 2개여도 같은 service line 개념이 여러 곳에서 반복되면 계층화가 맞다.
// 설계 재검토 기준이지 실행 시 판정 기준이 아니다.
// TODO_PHASE2.md 에도 같은 내용을 기록한다.
// ─────────────────────────────────────────────────────────────────────

// ========================================
// 1. segment split — 하나의 노선번호가 두 구간에서 서로 다른 실체인 경우
// ========================================
export const segmentSplits = [
  {
    sourceLineCode: 'I4102',
    sourceLineName: '경원선',
    criterion: 'station_code',      // 표준데이터 역번호
    boundary: '1015',               // 이 값 미만 / 이상으로 나눈다
    below: { identity: 'I4102@S', meaning: '용산(1003)~청량리(1014). 승객 관점 경의중앙 방면' },
    atOrAbove: { identity: 'I4102@N', meaning: '회기(1015)~연천(1919). 승객 관점 1호선 방면' },
    // 조사 근거: I4102 전국 35행의 raw 노선명은 전부 '경원선' 하나여서 이름으로는 나뉘지 않는다.
    //   각 행의 환승노선명으로 역추론하면 1014(청량리)까지는 1호선을 '환승'으로 나열하고,
    //   1015(회기)부터는 경의중앙선을 '환승'으로 나열한다 - 자기 자신은 환승에 적지 않으므로
    //   경계가 1014/1015 사이임이 전 역에서 일치했다.
    //   단일 매핑 실측: I4102->I4101 강제 시 왕십리·이촌·옥수·용산이 깨지고,
    //                  I4102->I4108 강제 시 창동·석계·도봉산이 깨진다. 분할 외의 해가 없다.
    reviewOnExpand: '경기 확장 시 회룡~연천(1905~1919)이 대상에 들어온다. 경계값은 그대로지만 적용 행이 늘어난다.',
  },
]

// ========================================
// 2. name split — 하나의 노선번호에 서로 다른 raw 노선명이 섞인 경우
// ========================================
export const nameSplits = [
  {
    sourceLineCode: 'I4108',
    byNormalizedLineName: {
      경의중앙선: { identity: 'I4108@GJ', meaning: '경의중앙선' },
      경춘선: { identity: 'I4108@GC', meaning: '경춘선' },
    },
    // 조사 근거: I4108 전국 54행 = 경의중앙선 51행(역번호 1014~1953) + 경춘선 3행(1019~1202).
    //   역번호 범위가 겹쳐서 segment split 로는 나뉘지 않지만 raw 노선명은 완전히 갈린다.
    //   광운대·중랑·상봉은 두 노선 행이 각각 존재한다.
    reviewOnExpand: '경춘선이 경기 구간까지 열리면 행 수만 늘고 분리 기준은 동일하다.',
  },
]

// 전국 기준 "하나의 노선번호에 복수 raw 노선명" 5종 중, 실제 실체가 다른 것은 I4108 뿐이다.
//   I4101 (1호선/경부선)          - 운영기관별 표기 차이. 분리하지 않는다
//   S1107 (7호선/도시철도 7호선)   - 서울·인천 직결 표기 차이. 분리하지 않는다
//   S1109 (서울/수도권 도시철도 9호선) - 공백 포함 표기 차이. 분리하지 않는다
//   I4401 (장항선/경부선)          - 서울 대상 밖

// ========================================
// 3. transfer-code adapter
//
//    환승노선번호가 노선번호와 다른 코드 체계를 쓰는 경우를 흡수한다.
//    특정 역의 merge 결과를 강제하는 하드코딩이 아니라 원천 코드 체계 정규화다.
//
//    ★★ 개념 정의 — 단일 번역이 아니라 "허용 집합"이다
//
//        transfer code -> single identity          (X)
//        transfer code -> acceptable identity set  (O)
//
//      환승노선번호는 원천에서 "source row 한 줄"이 아니라 "승객이 인지하는 서비스"를
//      가리킨다. 하나의 raw transfer service code 가 source data 의 복수 identity 를
//      지칭하는 경우가 있다. 예: I41K4(경의중앙 서비스)는 I4108@GJ 와 I4102@S 두
//      source identity 에 걸쳐 있다.
//
//      "I41K4 가 두 개의 노선이다"라는 뜻이 아니다. 하나의 서비스 코드가 원천에서
//      두 identity 로 표현되어 있다는 뜻이다.
//
//    ★★ acceptableIdentities 는 규칙 (5)의 membership 판정에만 쓴다.
//      source identity 자체를 합치지 않는다. I4108@GJ 와 I4102@S 는 끝까지 별개
//      identity 이고, coordinatePriority 등 source-row 기반 처리에서도 각각의 값을 갖는다.
//
//    ★ 접두어(S11=서울, I41=수도권)로 런타임에 추측하지 않는다.
//      문서화된 규격이 아니라 관찰된 패턴이라 예외가 나오면 조용히 틀린다.
//      아래 표에 등록된 코드만 해석하고, 표에 없는 새 코드는 unresolved 로 보고한다.
//
//    ★ 여기 있는 두 family(경의중앙·경춘) 외로 일반화하지 않는다.
//      특히 1호선 계열(I4101 / I1101 / I4102@N)은 묶지 않는다 - 그건 1호선 전체를
//      하나의 identity 로 만드는 것이고 사실상 3계층 모델이다. hold 로 남긴다.
// ========================================
export const transferCodeAdapter = {
  // ── 경의중앙 service family ──
  I41K4: {
    kind: 'service-family',
    acceptableIdentities: ['I4108@GJ', 'I4102@S'],
    observedLabels: ['경의중앙선', '수도권 광역철도 경의중앙', '수도권 광역철도 분당'],
    evidence:
      '서울 19행 전수. 공덕/홍대입구/디지털미디어시티/서울역에서 다른 코드로 설명되지 않는 형제가 I4108(경의중앙선) 단일. ' +
      '왕십리/이촌/옥수/용산/청량리에서는 같은 코드가 I4102 남부 구간(경의중앙 방면)을 지목하므로 두 identity 를 계열로 묶는다.',
    reviewOnExpand: false,
  },
  // ── 경춘 service family ──
  //    I41K2 는 그 자체가 source 노선번호이기도 하다(경춘선 별도 번호, 서울 2행).
  //    같은 경춘선 서비스가 I4108 안에도 raw 노선명 '경춘선'으로 들어 있어
  //    광운대·상봉·중랑에서 두 identity 가 서로를 지목한다.
  //    자기 자신(I41K2)을 집합에 포함해야 원래 맞던 관계가 깨지지 않는다.
  I41K2: {
    kind: 'service-family',
    acceptableIdentities: ['I4108@GC', 'I41K2'],
    observedLabels: ['경춘선', '수도권 광역철도 경춘', '경의중앙선'],
    evidence:
      '경춘선 서비스가 source code 두 개(I4108 의 raw 노선명 "경춘선" -> I4108@GC, 그리고 별도 노선번호 I41K2)에 ' +
      '걸쳐 있다. 광운대·상봉·중랑에서 상대 행이 I41K2 로 경춘선 승강장을 지목하는데 그 승강장의 source ' +
      'identity 는 I4108@GC 다. 경의중앙(I41K4)과 동일한 구조이며 실측으로 확인됐다.',
    reviewOnExpand: '경춘선이 경기 구간까지 열리면 I41K2 쪽 행이 늘어난다. 집합 구성은 동일하다.',
  },

  // ── 코드 체계 번역 (서비스 family 아님. 1:1 대응) ──
  I41K1: {
    kind: 'code-translation',
    acceptableIdentities: ['I4105'],
    observedLabels: ['수도권 광역철도 분당', '수인분당선', '수도권 광역철도 경의중앙'],
    evidence: '라벨 집합에 "수인분당선"이 있고 서울 내 대응 원천은 I4105(분당선) 뿐.',
    reviewOnExpand: '수인선(I28K1)이 대상에 들어오면 분당선 계열이 둘이 되어 재확인 필요.',
  },
  S11S1: {
    kind: 'code-translation',
    acceptableIdentities: ['S1109'],
    observedLabels: ['수도권 도시철도 9호선'],
    evidence: '서울 8행 전수에서 라벨이 9호선 하나이고 서울 내 9호선 원천은 S1109 뿐.',
    reviewOnExpand: false,
  },
  S1101: {
    kind: 'code-translation',
    acceptableIdentities: ['I4101'],
    observedLabels: ['서울 도시철도 1호선', '1호선'],
    evidence:
      '청량리역 두 행의 코드 집합 {S1101, I41K2, I4105} ↔ 라벨 집합 {1호선, 경춘선, 분당선}에서 ' +
      'I41K2=경춘·I4105=분당이 소거되어 S1101↔1호선 확정. 서울 내 1호선 계열 원천은 I4101 단일. ' +
      '(위치 기반 짝짓기가 아니라 집합 소거법이다.)',
    reviewOnExpand:
      '★ 부평(인천)에서는 같은 코드가 경인선(I1101)을 가리킨다. 인천 확장 시 S1101은 ' +
      '단일 identity 로 확정할 수 없게 되므로 반드시 재검토한다.',
  },
  S1104: {
    kind: 'code-translation',
    acceptableIdentities: ['I1104'],
    observedLabels: ['서울 도시철도 4호선', '4호선'],
    evidence:
      '서울역 두 행에서 {S1101, S1104}가 형제 {I4101, I1104}를 덮어야 하고, ' +
      'S1101=I4101이 청량리역에서 독립적으로 확정되므로 소거에 의해 S1104=I1104.',
    reviewOnExpand: '안산과천선(I4103)·진접선(I4104)이 대상에 들어오면 4호선 계열이 늘어 재확인 필요.',
  },
  I41D1: {
    kind: 'code-translation',
    acceptableIdentities: ['I11D1'],
    observedLabels: ['수도권 광역철도 신분당선'],
    evidence: '강남·양재 2행 전수에서 다른 코드로 설명되지 않는 형제가 I11D1(신분당선) 단일. 유일성 성립.',
    reviewOnExpand: false,
  },
}

// ========================================
// 4. coordinatePriority
//
//    ★ lineDisplayOrder 와 분리된 값이다.
//      lineDisplayOrder 는 사용자에게 노선을 나열하는 순서이고(아직 미확정),
//      이 표는 병합된 역의 대표 좌표를 어느 source row 에서 가져올지만 정한다.
//      결합해 두면 나중에 표시 모델을 손대는 순간 이미 백필된 좌표가 조용히 이동한다.
//
//    값의 근거: 이 순서는 "어느 좌표가 더 옳은가"가 아니라 "재실행해도 같은 값이 나오는가"를
//      위한 것이다. 대부분의 환승역에서 후보 좌표 간 차이는 300m 이내이고, 그중 어느
//      출입구를 대표로 쓸지는 정답이 없다. 따라서 정확도가 아니라 안정성 기준으로 고정한다.
//      배열 원칙: 서울교통공사 본선(1~9호선) → 서울시 운영 광역/경전철 → 한국철도 광역철도
//                → 공항철도 → 타 시도 운영 노선.
//      lineDisplayOrder 에서 복사하지 않고 line identity 기준으로 새로 구성했다.
//
//    ★ 여기 없는 identity 는 조용히 뒤로 밀지 않고 실행 보고에 드러낸다.
// ========================================
export const coordinatePriority = {
  I4101: 1,      // 1호선 / 경부선 (서울교통공사·한국철도 공용 번호)
  S1102: 2,      // 2호선 본선
  S1121: 3,      // 2호선 성수지선
  S1122: 4,      // 2호선 신정지선
  I1103: 5,      // 3호선
  I1104: 6,      // 4호선
  S1105: 7,      // 5호선
  S1106: 8,      // 6호선
  S1107: 9,      // 7호선
  S1108: 10,     // 8호선
  S1109: 11,     // 9호선
  L11UI: 20,     // 우이신설선
  L11SL: 21,     // 신림선
  'I4108@GJ': 30, // 경의중앙선
  'I4102@S': 31,  // 경원선 남부 구간(경의중앙 방면)
  'I4102@N': 32,  // 경원선 북부 구간(1호선 방면)
  I1101: 33,      // 경인선
  I4105: 34,      // 분당선
  I28K1: 35,      // 수인선
  I11D1: 36,      // 신분당선
  'I4108@GC': 37, // 경춘선
  I41K2: 38,      // 경춘선(별도 번호)
  I41K5: 39,      // 경강선
  I41WS: 40,      // 서해선
  I4106: 41,      // 일산선
  I4103: 42,      // 안산과천선
  I4104: 43,      // 진접선
  I28A1: 50,      // 인천국제공항선
  L41G1: 60,      // 김포도시철도
  L41U1: 61,      // 의정부경전철
  S2801: 70,      // 인천 1호선
  S2802: 71,      // 인천 2호선
  S4108: 72,      // 별내선
}

// ========================================
// 해석 함수
// ========================================

/** 원천 행 하나의 line identity. 기본은 노선번호이고 reference rule 이 있을 때만 갈린다. */
export function lineIdentityOf(unit) {
  for (const s of segmentSplits) {
    if (unit.lineCode !== s.sourceLineCode) continue
    if (s.criterion !== 'station_code') continue
    const code = String(unit.stationCode ?? '')
    if (code === '') return unit.lineCode // 역번호가 없으면 분할하지 않는다(추측 금지)
    return code < s.boundary ? s.below.identity : s.atOrAbove.identity
  }
  for (const n of nameSplits) {
    if (unit.lineCode !== n.sourceLineCode) continue
    const hit = n.byNormalizedLineName[unit.lineName?.trim()]
    if (hit) return hit.identity
    // 등록되지 않은 raw 노선명 -> 추측하지 않고 원본 번호를 그대로 쓴다. run 이 경고로 보고한다.
    return unit.lineCode
  }
  return unit.lineCode
}

/**
 * 하나의 source 노선번호가 만들어 낼 수 있는 identity 전체.
 * 환승노선번호가 "분할 전 번호"로 들어올 때 어느 쪽을 가리키는지 알 수 없으므로 집합으로 받는다.
 * (예: 광운대역 I4108 행의 환승노선번호는 I4102 인데, 그 역의 I4102 는 북부 구간이다)
 */
function identitiesForSourceCode(code) {
  const seg = segmentSplits.find((s) => s.sourceLineCode === code)
  if (seg) return [seg.below.identity, seg.atOrAbove.identity]
  const nm = nameSplits.find((n) => n.sourceLineCode === code)
  if (nm) return Object.values(nm.byNormalizedLineName).map((v) => v.identity)
  return [code]
}

/**
 * 행이 신고한 환승 노선의 identity 집합.
 *
 * ★ 환승노선번호를 환승노선명과 위치로 짝짓지 않는다.
 *   실측 확인: 왕십리 codes=[S1105, I41K4, I41K1] / names=[5호선, 분당, 경의중앙] 처럼
 *   순서가 어긋난 행이 있다. 규칙 (5)는 멤버십 검사이므로 집합이면 충분하다.
 *
 * @returns {{ identities: Set<string>, unresolved: string[] }}
 */
export function transferIdentitiesOf(unit, knownSourceCodes) {
  const identities = new Set()
  const unresolved = []
  for (const code of unit.transferLineCodes) {
    const mapped = transferCodeAdapter[code]
    if (mapped) {
      for (const id of mapped.acceptableIdentities) identities.add(id)
      continue
    }
    if (knownSourceCodes.has(code)) {
      for (const id of identitiesForSourceCode(code)) identities.add(id)
      continue
    }
    // 표에 없고 원천 노선번호도 아닌 새 코드 -> 자동 추측하지 않는다.
    unresolved.push(code)
  }
  return { identities, unresolved }
}

export function coordinatePriorityOf(identity) {
  return Object.hasOwn(coordinatePriority, identity) ? coordinatePriority[identity] : null
}
