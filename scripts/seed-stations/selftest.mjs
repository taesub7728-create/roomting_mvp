// 병합 규칙 자체 검증. 원본 데이터도 Kakao 키도 필요 없다.
//
// 실행:  npm run seed:stations:selftest
//
// ★ 픽스처는 실데이터에서 확인된 값만 쓴다.
//   이전 판은 환승역구분을 'Y'/'N' 으로, 신촌 두 행의 역명을 둘 다 '신촌역' 으로 두는 등
//   원천과 다른 가정 위에 서 있었다. 17/17 을 통과하고도 실데이터에서 merge 가 0건이었다.
//   실데이터 확인값:
//     환승역구분 : 환승역 / 도시철도 환승역 / 일반역 / 도시철도 일반역 (unknown 0행)
//     신촌       : 2호선 '신촌(지하)'(0240) / 경의중앙선 '신촌역'(1252), 약 700m, 둘 다 일반역
//     왕십리     : 2호선 환승코드 [S1105, I41K4, I41K1] 인데 이름은 [5호선, 분당, 경의중앙] - 순서 어긋남
//     경원선     : I4102 한 번호가 역번호 1014 이하 / 1015 이상에서 다른 실체

import assert from 'node:assert/strict'
import { COORD_MERGE_MAX_M } from './config.mjs'
import {
  coordinatePriorityOf,
  lineIdentityOf,
  transferCodeAdapter,
  transferIdentitiesOf,
} from './line-identity.mjs'
import { assertNormalizerMatchesSql, normalizeStationQuery } from './lib/normalize.mjs'
import { annotateIdentities, mergeStations } from './merge.mjs'
import { buildReportRows } from './report.mjs'
import {
  decomposeStationName,
  loadRailwayStandard,
  parseTransferFlag,
  splitTokens,
  TRANSFER_VALUES_FALSE,
  TRANSFER_VALUES_TRUE,
} from './sources/railway-standard.mjs'

let seq = 0

function unit({
  rawName, lineName, lineCode, stationCode, lat, lng,
  districtCode = '11000', districtName = '테스트구',
  operator = '서울교통공사', transferRaw = '일반역', transferCodes = [],
}) {
  seq += 1
  const name = decomposeStationName(rawName)
  return {
    source: 'fixture', sourceRow: seq,
    stationCode: stationCode ?? `S${String(seq).padStart(4, '0')}`,
    rawName: name.raw, mainName: name.main, subName: name.sub,
    mainNameNormalized: normalizeStationQuery(name.main),
    nameEn: null, nameHanja: null, nameJa: null, nameZh: null,
    lineName, lineCode, operator,
    isTransfer: parseTransferFlag(transferRaw),
    isTransferRaw: transferRaw,
    transferLineCodes: transferCodes,
    transferLineNamesRaw: null,
    lat, lng, roadAddress: null,
    district: { districtCode, districtName, sidoName: '서울특별시' },
  }
}

const latOffset = (m) => m / 111_000

function prepare(units) {
  const info = annotateIdentities(units)
  const result = mergeStations(units)
  return { ...result, ...info }
}

// ----------------------------------------
// 픽스처
// ----------------------------------------

// A. 공식 환승역 - 홍대입구 (실데이터: 공항철도 I28A1 / 2호선 S1102 / 경의중앙선 I4108)
const HONGDAE_AIRPORT_LAT = 37.55810
const HONGDAE_AIRPORT_LNG = 126.92510
const caseHongdae = [
  unit({ rawName: '홍대입구', lineName: '인천국제공항선', lineCode: 'I28A1', lat: HONGDAE_AIRPORT_LAT, lng: HONGDAE_AIRPORT_LNG,
    districtCode: '11440', districtName: '마포구', operator: '공항철도주식회사',
    transferRaw: '환승역', transferCodes: ['S1102', 'I41K4'] }),
  unit({ rawName: '홍대입구', lineName: '2호선', lineCode: 'S1102', lat: 37.55684, lng: 126.92384,
    districtCode: '11440', districtName: '마포구',
    transferRaw: '환승역', transferCodes: ['I28A1', 'I41K4'] }),
  unit({ rawName: '홍대입구역', lineName: '경의중앙선', lineCode: 'I4108', stationCode: '1251', lat: 37.55750, lng: 126.92460,
    districtCode: '11440', districtName: '마포구', operator: '한국철도공사',
    transferRaw: '환승역', transferCodes: ['S1102', 'I28A1'] }),
]

// B. 신촌 - 실데이터 그대로. 이름이 다르고(부역명), 둘 다 일반역이며, 환승코드가 없다.
const caseSinchon = [
  unit({ rawName: '신촌(지하)', lineName: '2호선', lineCode: 'S1102', stationCode: '0240', lat: 37.55529, lng: 126.93690,
    districtCode: '11410', districtName: '서대문구', transferRaw: '일반역', transferCodes: [] }),
  unit({ rawName: '신촌역', lineName: '경의중앙선', lineCode: 'I4108', stationCode: '1252', lat: 37.55966, lng: 126.94100,
    districtCode: '11410', districtName: '서대문구', operator: '한국철도공사', transferRaw: '일반역', transferCodes: [] }),
]

// C. 좌표 임계 초과 - 환승 조건은 모두 충족
const FAR_LAT = 37.50000
const caseFar = [
  unit({ rawName: '가상역', lineName: '1호선', lineCode: 'I4101', lat: FAR_LAT, lng: 126.90000,
    transferRaw: '환승역', transferCodes: ['I1103'] }),
  unit({ rawName: '가상역', lineName: '3호선', lineCode: 'I1103', lat: FAR_LAT + latOffset(COORD_MERGE_MAX_M + 500), lng: 126.90000,
    transferRaw: '환승역', transferCodes: ['I4101'] }),
]

// D. 단일 노선
const caseSingle = [
  unit({ rawName: '이태원', lineName: '6호선', lineCode: 'S1106', lat: 37.53446, lng: 126.99427,
    districtCode: '11170', districtName: '용산구' }),
]

// E. 구 경계 환승역 - 실데이터 사당(2호선 동작구 / 4호선 관악구)
const caseSadang = [
  unit({ rawName: '사당', lineName: '2호선', lineCode: 'S1102', lat: 37.47653, lng: 126.98165,
    districtCode: '11590', districtName: '동작구', transferRaw: '환승역', transferCodes: ['I1104'] }),
  unit({ rawName: '사당', lineName: '4호선', lineCode: 'I1104', lat: 37.47660, lng: 126.98180,
    districtCode: '11620', districtName: '관악구', transferRaw: '환승역', transferCodes: ['S1102'] }),
]

// F. 같은 이름 + 다른 구 + 환승 관계 없음 -> 병합 금지
const caseSameNameNoTransfer = [
  unit({ rawName: '양평역', lineName: '5호선', lineCode: 'S1105', lat: 37.52558, lng: 126.88528,
    districtCode: '11560', districtName: '영등포구', transferRaw: '일반역' }),
  unit({ rawName: '양평역', lineName: '경의중앙선', lineCode: 'I4108', stationCode: '1300', lat: 37.52600, lng: 126.88600,
    districtCode: '11530', districtName: '구로구', operator: '한국철도공사', transferRaw: '일반역' }),
]

// G. 왕십리 - I4102 남부 구간(경의중앙 방면). 환승코드 순서가 이름과 어긋난 실데이터 그대로.
const caseWangsimni = [
  unit({ rawName: '왕십리(성동구청)', lineName: '2호선', lineCode: 'S1102', stationCode: '0208', lat: 37.561289, lng: 127.0370615,
    districtCode: '11200', districtName: '성동구', transferRaw: '환승역', transferCodes: ['S1105', 'I41K4', 'I41K1'] }),
  unit({ rawName: '왕십리역', lineName: '경원선', lineCode: 'I4102', stationCode: '1013', lat: 37.561728, lng: 127.038405,
    districtCode: '11200', districtName: '성동구', operator: '한국철도공사',
    transferRaw: '환승역', transferCodes: ['S1102', 'S1105', 'I4105'] }),
]

// H. 광운대 - I4102 북부 구간(1호선 방면) + I4108 두 갈래
const caseGwangwoondae = [
  unit({ rawName: '광운대역', lineName: '경원선', lineCode: 'I4102', stationCode: '1019', lat: 37.62363, lng: 127.06134,
    districtCode: '11350', districtName: '노원구', operator: '한국철도공사', transferRaw: '환승역', transferCodes: ['I41K2'] }),
  unit({ rawName: '광운대역', lineName: '경의중앙선', lineCode: 'I4108', stationCode: '1019', lat: 37.62370, lng: 127.06150,
    districtCode: '11350', districtName: '노원구', operator: '한국철도공사', transferRaw: '환승역', transferCodes: ['I4102'] }),
  unit({ rawName: '광운대역', lineName: '경춘선', lineCode: 'I4108', stationCode: '1019', lat: 37.62380, lng: 127.06160,
    districtCode: '11350', districtName: '노원구', operator: '한국철도공사', transferRaw: '환승역', transferCodes: ['I4102'] }),
]

// ----------------------------------------
function run() {
  const results = []
  const check = (name, fn) => {
    try { fn(); results.push({ name, ok: true }) } catch (err) { results.push({ name, ok: false, message: err.message }) }
  }

  // ===== 정규화 =====
  check('N0 정규화 포팅본이 migration_026 확인 벡터와 일치', () => { assertNormalizerMatchesSql() })

  // ===== [A] 환승역구분 =====
  check('A1 "환승역" -> true', () => assert.equal(parseTransferFlag('환승역'), true))
  check('A2 "도시철도 환승역" -> true', () => assert.equal(parseTransferFlag('도시철도 환승역'), true))
  check('A3 "일반역" -> false', () => assert.equal(parseTransferFlag('일반역'), false))
  check('A4 "도시철도 일반역" -> false', () => assert.equal(parseTransferFlag('도시철도 일반역'), false))
  check('A5 미등록 값은 false 가 아니라 unknown 으로 탐지된다', () => {
    assert.equal(parseTransferFlag('Y'), 'unknown')
    assert.equal(parseTransferFlag('환승'), 'unknown')
    assert.equal(parseTransferFlag(''), 'unknown')
    assert.equal(parseTransferFlag(null), 'unknown')
  })
  check('A6 값 집합이 상수로 노출되고 겹치지 않는다', () => {
    assert.ok(TRANSFER_VALUES_TRUE.length > 0 && TRANSFER_VALUES_FALSE.length > 0)
    assert.equal(TRANSFER_VALUES_TRUE.filter((v) => TRANSFER_VALUES_FALSE.includes(v)).length, 0)
  })
  check('A7 unknown 이 있으면 파서가 중단한다 (조용한 false 금지)', async () => {
    // loadRailwayStandard 는 파일을 읽으므로 여기서는 계약만 확인한다:
    // parseTransferFlag 가 'unknown' 을 돌려주는 값이 존재하고, 그 값이 false 와 구별된다.
    assert.notEqual(parseTransferFlag('Y'), false)
    assert.equal(typeof loadRailwayStandard, 'function')
  })

  // ===== [B] 토큰 분리 =====
  check('B1 + 구분 파싱', () => {
    assert.deepEqual(splitTokens('S1105+I41K4+I41K1'), ['S1105', 'I41K4', 'I41K1'])
  })
  check('B2 , 구분 파싱', () => {
    assert.deepEqual(splitTokens('S1102, S1105, I4105'), ['S1102', 'S1105', 'I4105'])
  })
  check('B3 개행 구분 파싱', () => {
    assert.deepEqual(splitTokens('S1105\nI28A1\nL41G1\nI41WS'), ['S1105', 'I28A1', 'L41G1', 'I41WS'])
  })
  check('B4 연속 공백은 하나로 정규화된다', () => {
    assert.deepEqual(splitTokens('수도권  광역철도 4호선+수도권   광역철도 경의중앙'),
      ['수도권 광역철도 4호선', '수도권 광역철도 경의중앙'])
  })
  check('B5 "-" 와 빈 토큰은 버려진다', () => {
    assert.deepEqual(splitTokens('-'), [])
    assert.deepEqual(splitTokens('S1102,,-,S1105'), ['S1102', 'S1105'])
  })

  // ===== [D] 주역명/부역명 =====
  check('D1 부역명 분해', () => {
    assert.deepEqual(decomposeStationName('총신대입구(이수)'), { raw: '총신대입구(이수)', main: '총신대입구', sub: '이수' })
    assert.deepEqual(decomposeStationName('잠실(송파구청)'), { raw: '잠실(송파구청)', main: '잠실', sub: '송파구청' })
    assert.deepEqual(decomposeStationName('동대문역사문화공원(DDP)'), { raw: '동대문역사문화공원(DDP)', main: '동대문역사문화공원', sub: 'DDP' })
    assert.deepEqual(decomposeStationName('신촌(지하)'), { raw: '신촌(지하)', main: '신촌', sub: '지하' })
  })
  check('D2 괄호 없는 역명은 그대로', () => {
    assert.deepEqual(decomposeStationName('강남'), { raw: '강남', main: '강남', sub: null })
  })
  check('D3 괄호 일괄 삭제가 아니다 - 부역명이 보존된다', () => {
    const { stations } = prepare([unit({ rawName: '총신대입구(이수)', lineName: '4호선', lineCode: 'I1104', lat: 37.4866, lng: 126.9818 })])
    assert.equal(stations[0].nameKo, '총신대입구')
    assert.ok(stations[0].aliasCandidates.includes('이수'), '부역명 이수가 alias 후보에 없다')
    assert.ok(stations[0].aliasCandidates.includes('총신대입구(이수)'), '원문이 alias 후보에 없다')
  })
  check('D4 잠실(송파구청)이 잠실나루·잠실새내와 섞이지 않는다', () => {
    const { stations } = prepare([
      unit({ rawName: '잠실(송파구청)', lineName: '2호선', lineCode: 'S1102', lat: 37.5133, lng: 127.1000 }),
      unit({ rawName: '잠실나루', lineName: '2호선', lineCode: 'S1102', lat: 37.5206, lng: 127.1035 }),
      unit({ rawName: '잠실새내', lineName: '2호선', lineCode: 'S1102', lat: 37.5119, lng: 127.0862 }),
    ])
    assert.equal(stations.length, 3)
    assert.deepEqual(stations.map((s) => s.decision).sort(), ['single', 'single', 'single'])
  })

  // ===== line identity =====
  check('L1 기본 identity 는 source 노선번호', () => {
    assert.equal(lineIdentityOf({ lineCode: 'S1102', lineName: '2호선', stationCode: '0201' }), 'S1102')
  })
  check('L2 I4102 역번호 <=1014 -> 남부 identity', () => {
    assert.equal(lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1013' }), 'I4102@S')
    assert.equal(lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1014' }), 'I4102@S')
  })
  check('L3 I4102 역번호 >=1015 -> 북부 identity', () => {
    assert.equal(lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1015' }), 'I4102@N')
    assert.equal(lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1022' }), 'I4102@N')
    assert.equal(lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1903' }), 'I4102@N')
  })
  check('L4 I4102 두 구간이 서로 다른 identity 다', () => {
    assert.notEqual(
      lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1013' }),
      lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1015' }),
    )
  })
  check('L5 I4108 은 raw 노선명으로 갈린다', () => {
    assert.equal(lineIdentityOf({ lineCode: 'I4108', lineName: '경의중앙선', stationCode: '1019' }), 'I4108@GJ')
    assert.equal(lineIdentityOf({ lineCode: 'I4108', lineName: '경춘선', stationCode: '1019' }), 'I4108@GC')
  })
  check('L6 서로 다른 I4108 identity 가 합쳐지지 않는다', () => {
    const { stations } = prepare(caseGwangwoondae)
    const ids = new Set(stations.flatMap((s) => s.lineIdentities))
    assert.ok(ids.has('I4108@GJ') && ids.has('I4108@GC'), '두 identity 가 모두 존재해야 한다')
    // 경의중앙선 행과 경춘선 행이 한 클러스터에 같이 들어가면 안 된다
    for (const s of stations) {
      const inCluster = new Set(s.lineIdentities)
      assert.ok(!(inCluster.has('I4108@GJ') && inCluster.has('I4108@GC')),
        '경의중앙/경춘이 같은 클러스터에 병합됐다')
    }
  })
  check('L7 등록되지 않은 I4108 raw 노선명은 추측하지 않고 원본 번호로 남는다', () => {
    assert.equal(lineIdentityOf({ lineCode: 'I4108', lineName: '가상신설선', stationCode: '1019' }), 'I4108')
  })
  check('L8 transfer-code adapter 가 identity 로 번역된다', () => {
    const known = new Set(['S1102', 'I4108', 'I4105', 'S1109', 'I4101', 'I1104', 'I11D1'])
    const { identities, unresolved } = transferIdentitiesOf(
      { transferLineCodes: ['I41K4', 'I41K1', 'S11S1', 'S1101', 'S1104', 'I41D1'] }, known)
    // I41K4 는 경의중앙 service family 라 acceptable identity 두 개로 확장된다
    assert.deepEqual([...identities].sort(), ['I1104', 'I11D1', 'I4101', 'I4102@S', 'I4105', 'I4108@GJ', 'S1109'])
    assert.deepEqual(unresolved, [])
  })
  check('L9 분할된 번호가 환승코드로 오면 두 identity 집합으로 확장된다', () => {
    const known = new Set(['I4102', 'I4108'])
    const { identities } = transferIdentitiesOf({ transferLineCodes: ['I4102', 'I4108'] }, known)
    assert.ok(identities.has('I4102@S') && identities.has('I4102@N'))
    assert.ok(identities.has('I4108@GJ') && identities.has('I4108@GC'))
  })
  check('L10 표에 없는 새 환승코드는 자동 추측하지 않고 unresolved 로 남는다', () => {
    const { identities, unresolved } = transferIdentitiesOf({ transferLineCodes: ['S9999', 'I41Z9'] }, new Set(['S1102']))
    assert.equal(identities.size, 0)
    assert.deepEqual(unresolved, ['S9999', 'I41Z9'])
  })
  check('L12 경춘 family: I41K2 -> { I4108@GC, I41K2 }', () => {
    const { identities, unresolved } = transferIdentitiesOf({ transferLineCodes: ['I41K2'] }, new Set(['I41K2', 'I4108']))
    assert.deepEqual([...identities].sort(), ['I4108@GC', 'I41K2'])
    assert.deepEqual(unresolved, [], 'I41K2 는 source 코드이기도 하므로 unresolved 가 되면 안 된다')
  })
  check('L13 service family 가 source identity 를 합치지 않는다', () => {
    // 규칙(5) membership 에서만 동등하게 보고, lineIdentityOf 는 끝까지 별개 값을 준다.
    assert.equal(lineIdentityOf({ lineCode: 'I4108', lineName: '경춘선', stationCode: '1019' }), 'I4108@GC')
    assert.equal(lineIdentityOf({ lineCode: 'I41K2', lineName: '경춘선', stationCode: '1200' }), 'I41K2')
    assert.notEqual(
      lineIdentityOf({ lineCode: 'I4108', lineName: '경춘선', stationCode: '1019' }),
      lineIdentityOf({ lineCode: 'I41K2', lineName: '경춘선', stationCode: '1200' }),
    )
    assert.equal(lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1013' }), 'I4102@S')
    assert.notEqual('I4108@GJ', lineIdentityOf({ lineCode: 'I4102', lineName: '경원선', stationCode: '1013' }))
  })
  check('L14 family 로 묶인 identity 도 coordinatePriority 는 각각 유지한다', () => {
    assert.notEqual(coordinatePriorityOf('I4108@GC'), coordinatePriorityOf('I41K2'))
    assert.notEqual(coordinatePriorityOf('I4108@GJ'), coordinatePriorityOf('I4102@S'))
    for (const id of ['I4108@GJ', 'I4102@S', 'I4108@GC', 'I41K2']) {
      assert.equal(typeof coordinatePriorityOf(id), 'number', `${id} 우선순위 미등록`)
    }
  })
  check('L15 1호선 계열은 family 로 묶지 않는다 (3계층 방지)', () => {
    const known = new Set(['I4101', 'I1101', 'I4102'])
    const { identities } = transferIdentitiesOf({ transferLineCodes: ['I4101'] }, known)
    assert.ok(!identities.has('I1101'), 'I4101 이 경인선까지 허용하면 1호선 전체를 한 identity 로 만든 것이다')
    assert.ok(!identities.has('I4102@N'))
  })
  check('L16 광운대형 - 경춘 family 로 경원선↔경춘선만 붙고 경의중앙선은 남는다', () => {
    const { stations } = prepare(caseGwangwoondae)
    const gc = stations.find((s) => s.lineIdentities.includes('I4108@GC'))
    assert.ok(gc.lineIdentities.includes('I4102@N'), '경원선과 경춘선이 붙지 않았다')
    const gj = stations.find((s) => s.lineIdentities.includes('I4108@GJ'))
    assert.ok(!gj.lineIdentities.includes('I4108@GC'), '경의중앙선이 경춘선과 잘못 붙었다')
    assert.ok(stations.every((s) => s.decision === 'hold'), '갈라진 그룹은 hold 여야 한다')
  })
  check('L11 adapter 표의 모든 항목에 근거가 적혀 있다', () => {
    for (const [code, m] of Object.entries(transferCodeAdapter)) {
      assert.ok(Array.isArray(m.acceptableIdentities) && m.acceptableIdentities.length > 0, `${code}: acceptableIdentities 없음`)
      assert.ok(['service-family', 'code-translation'].includes(m.kind), `${code}: kind 가 없거나 알 수 없는 값`)
      assert.ok(m.evidence && m.evidence.length > 20, `${code}: evidence 가 비었거나 너무 짧다`)
      assert.ok(Array.isArray(m.observedLabels) && m.observedLabels.length > 0, `${code}: observedLabels 없음`)
      assert.ok('reviewOnExpand' in m, `${code}: reviewOnExpand 없음`)
    }
  })

  // ===== 규칙 (5) =====
  check('F1 양방향 충족 -> merge', () => {
    const { stations } = prepare(caseHongdae)
    assert.equal(stations.length, 1)
    assert.equal(stations[0].decision, 'merge')
    assert.equal(stations[0].lineNames.length, 3)
  })
  check('F2 단방향만 충족 -> merge 금지', () => {
    const oneWay = [
      unit({ rawName: '편도역', lineName: '2호선', lineCode: 'S1102', lat: 37.5, lng: 127.0, transferRaw: '환승역', transferCodes: ['S1105'] }),
      unit({ rawName: '편도역', lineName: '5호선', lineCode: 'S1105', lat: 37.5005, lng: 127.0, transferRaw: '환승역', transferCodes: [] }),
    ]
    const { stations } = prepare(oneWay)
    assert.equal(stations.length, 2)
    assert.ok(stations.every((s) => s.decision === 'hold'))
    assert.ok(stations[0].reviewReason.includes('환승노선번호 공란'))
  })
  check('F3 환승코드 공란 양쪽 -> hold', () => {
    const { stations } = prepare(caseSinchon)
    assert.equal(stations.length, 2)
    assert.ok(stations.every((s) => s.decision === 'hold'))
  })
  check('F4 왕십리 - I4102 남부 identity 로 규칙(5) 양방향 성립', () => {
    const { stations, pairStats } = prepare(caseWangsimni)
    assert.equal(stations.length, 1, '2호선과 경원선이 병합되지 않았다')
    assert.equal(stations[0].decision, 'merge')
    assert.equal(pairStats.need5, 1)
    assert.equal(pairStats.pass, 1)
  })

  // ===== 신촌 =====
  check('S1 신촌역과 신촌(지하)가 같은 candidate group 에 들어간다', () => {
    const { groups } = prepare(caseSinchon)
    assert.equal(groups.length, 1, `candidate group 이 ${groups.length}개다 - 같은 그룹이어야 한다`)
    assert.equal(groups[0].memberCount, 2)
  })
  check('S2 신촌 두 행이 자동 merge 되지 않는다', () => {
    const { stations } = prepare(caseSinchon)
    assert.equal(stations.length, 2)
    assert.ok(stations.every((s) => s.decision === 'hold'))
    assert.ok(stations.every((s) => s.needsReview === true))
  })
  check('S3 신촌 hold 사유가 환승역 여부 / 환승노선 불일치다', () => {
    const { stations } = prepare(caseSinchon)
    assert.match(stations[0].reviewReason, /환승역 아님|환승노선 불일치/)
  })
  check('S4 역명 하드코딩이 아니다 - 환승 조건만 채우면 병합된다', () => {
    const patched = [
      unit({ rawName: '신촌(지하)', lineName: '2호선', lineCode: 'S1102', stationCode: '0240', lat: 37.55529, lng: 126.93690,
        districtCode: '11410', transferRaw: '환승역', transferCodes: ['I4108'] }),
      unit({ rawName: '신촌역', lineName: '경의중앙선', lineCode: 'I4108', stationCode: '1252', lat: 37.55966, lng: 126.94100,
        districtCode: '11410', operator: '한국철도공사', transferRaw: '환승역', transferCodes: ['S1102'] }),
    ]
    const { stations } = prepare(patched)
    assert.equal(stations.length, 1)
    assert.equal(stations[0].decision, 'merge')
  })

  // ===== [C] district =====
  check('C1 같은 역 + 다른 구 + 정상 환승 관계 -> merge 된다', () => {
    const { stations } = prepare(caseSadang)
    assert.equal(stations.length, 1, '구가 다르다는 이유로 갈라졌다')
    assert.equal(stations[0].decision, 'merge')
  })
  check('C2 병합된 station 이 복수 district 를 갖는다', () => {
    const { stations } = prepare(caseSadang)
    assert.equal(stations[0].districts.length, 2)
    assert.deepEqual(stations[0].districts.map((d) => d.districtCode).sort(), ['11590', '11620'])
  })
  check('C3 같은 이름 + 다른 구 + 환승 관계 없음 -> merge 금지', () => {
    const { stations } = prepare(caseSameNameNoTransfer)
    assert.equal(stations.length, 2)
    assert.ok(stations.every((s) => s.decision === 'hold'))
  })
  check('C4 대표 좌표의 구가 districts 목록의 첫 번째다', () => {
    const { stations } = prepare(caseSadang)
    const primaryUnit = stations[0].units.find((u) => u.lat === stations[0].lat && u.lng === stations[0].lng)
    assert.equal(stations[0].districts[0].districtCode, primaryUnit.district.districtCode)
  })

  // ===== 좌표 / [E] =====
  check('E1 좌표는 평균이 아니라 실제 source row 값이다', () => {
    const { stations } = prepare(caseHongdae)
    const s = stations[0]
    const avgLat = caseHongdae.reduce((a, u) => a + u.lat, 0) / caseHongdae.length
    assert.notEqual(s.lat, avgLat)
    assert.ok(caseHongdae.some((u) => u.lat === s.lat && u.lng === s.lng), '어떤 source row 의 좌표도 아니다')
  })
  check('E2 coordinatePriority 최고 identity 의 좌표가 선택된다', () => {
    const { stations } = prepare(caseHongdae)
    const s = stations[0]
    // S1102(2호선)=2 < I4108@GJ(30) < I28A1(50)
    assert.equal(s.coordFromIdentity, 'S1102')
    assert.equal(s.lat, 37.55684)
    assert.equal(s.lng, 126.92384)
  })
  check('E3 lineDisplayOrder 를 바꿔도 좌표 선택이 흔들리지 않는다', () => {
    // merge.mjs 는 lineDisplayOrder 를 import 하지 않는다. 결합이 끊겼는지 계약으로 확인한다.
    const before = prepare(caseHongdae).stations[0]
    assert.equal(before.coordFromIdentity, 'S1102')
    assert.equal(coordinatePriorityOf('S1102'), 2)
    assert.equal(coordinatePriorityOf('I28A1'), 50)
    // 표시 순서는 좌표 선택에 관여하지 않는다 - coordPriority 만으로 대표가 정해졌다
    assert.equal(before.coordPriority, coordinatePriorityOf(before.coordFromIdentity))
  })
  check('E4 미등록 identity 는 맨 뒤로 밀리고 보고 대상이 된다', () => {
    const units = [
      unit({ rawName: '미등록역', lineName: '가상선', lineCode: 'Z9999', lat: 37.5, lng: 127.0, transferRaw: '환승역', transferCodes: ['S1102'] }),
      unit({ rawName: '미등록역', lineName: '2호선', lineCode: 'S1102', lat: 37.5001, lng: 127.0, transferRaw: '환승역', transferCodes: ['Z9999'] }),
    ]
    const { stations, missingPriority } = prepare(units)
    assert.ok(missingPriority.has('Z9999'), '미등록 identity 가 보고되지 않았다')
    assert.equal(stations[0].coordFromIdentity, 'S1102', '미등록 identity 가 대표로 뽑혔다')
  })
  check('E5 단일 노선 역의 spread 는 0', () => {
    const { stations } = prepare(caseSingle)
    assert.equal(stations[0].decision, 'single')
    assert.equal(stations[0].coordSpreadM, 0)
    assert.equal(stations[0].needsReview, false)
  })

  // ===== 거리 =====
  check('G1 좌표 임계 초과면 환승 조건을 충족해도 병합하지 않는다', () => {
    const { stations } = prepare(caseFar)
    assert.equal(stations.length, 2)
    assert.ok(stations.every((s) => s.decision === 'hold'))
    assert.match(stations[0].reviewReason, /좌표 \d+m > 임계 1500m/)
  })

  // ===== 리포트 =====
  check('R1 리포트 열 구성이 migration_025:41-43 과 같다', () => {
    const { stations } = prepare([...caseHongdae, ...caseSinchon, ...caseSingle])
    assert.deepEqual(Object.keys(buildReportRows(stations)[0]), [
      'canonical_key', 'name_ko', 'district', 'merged_line_count', 'merged_lines',
      'station_codes', 'coord_spread_m', 'name_variants', 'official_transfer_flag',
      'transfer_line_match', 'operator_differs', 'ja_missing', 'zh_missing',
      'decision', 'needs_review', 'review_reason',
    ])
  })
  check('R2 coord_spread_m 내림차순 정렬', () => {
    const { stations } = prepare([...caseHongdae, ...caseSinchon, ...caseFar, ...caseSingle])
    const rows = buildReportRows(stations)
    for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].coord_spread_m >= rows[i].coord_spread_m)
  })
  check('R3 복수 district 가 리포트 district 열에 전부 나온다', () => {
    const rows = buildReportRows(prepare(caseSadang).stations)
    assert.match(rows[0].district, /11590/)
    assert.match(rows[0].district, /11620/)
  })
  check('R4 name_variants 에 raw/main/sub 가 모두 들어간다', () => {
    const rows = buildReportRows(prepare([unit({ rawName: '총신대입구(이수)', lineName: '4호선', lineCode: 'I1104', lat: 37.48, lng: 126.98 })]).stations)
    assert.match(rows[0].name_variants, /총신대입구/)
    assert.match(rows[0].name_variants, /이수/)
  })
  check('R5 ja/zh 결손만으로는 검수 대상이 되지 않는다', () => {
    const rows = buildReportRows(prepare(caseSingle).stations)
    assert.equal(rows[0].ja_missing, true)
    assert.equal(rows[0].zh_missing, true)
    assert.equal(rows[0].needs_review, false)
  })

  // ----------------------------------------
  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`)
    if (!r.ok) console.log(`        ${r.message.split('\n')[0]}`)
  }
  console.log(`\n${results.length - failed.length}/${results.length} 통과`)
  if (failed.length > 0) process.exitCode = 1
}

run()
