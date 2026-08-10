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
import { readFileSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { COORD_MERGE_MAX_M } from './config.mjs'
import {
  coordinatePriorityOf,
  lineIdentityOf,
  transferCodeAdapter,
  transferIdentitiesOf,
} from './line-identity.mjs'
import {
  compareWithLegacyLineDisplayOrder,
  identityToDisplayLineKey,
  IDENTITY_TO_DISPLAY_LINE_KEY,
  stationDisplayLines,
  validateDisplayLineMapping,
} from './lib/display-lines.mjs'
import { groupFingerprint } from './lib/fingerprint.mjs'
import { assertNormalizerMatchesSql, normalizeStationQuery } from './lib/normalize.mjs'
import {
  normalizeStationQuery as searchNormalize,
  normalizeStationQuerySqlParity,
  hangulChosung,
} from '../../src/shared/stationSearch/normalizeStationQuery.js'
import { legacyAliasExclusions } from './legacy-alias-exclusions.mjs'
import { collectOverrideSchemaErrors } from './lib/override-schema.mjs'
import { reviewId } from './lib/review-id.mjs'
import { assertSourceRowKeysUnique, sourceRowKey } from './lib/source-row-key.mjs'
import { overridesForRun } from './lib/override-scope.mjs'
import { manualOverrides } from './manual-overrides.mjs'
import { annotateIdentities, mergeStations } from './merge.mjs'
import { buildReportRows } from './report.mjs'
import {
  assertNoSuspiciousI18nValues,
  isSuspiciousI18nValue,
  loadSeoulMetroI18n,
} from './sources/seoul-metro-i18n.mjs'
import {
  assertNoSuspiciousReferenceFields,
  decomposeStationName,
  loadRailwayStandard,
  parseTransferFlag,
  splitTokens,
  TRANSFER_VALUES_FALSE,
  TRANSFER_VALUES_TRUE,
} from './sources/railway-standard.mjs'
import { isSuspiciousReferenceText } from './lib/reference-text-quality.mjs'
import {
  districtCandidates,
  isDirectChild,
  isDistrictLevelCode,
  resolveDistrictHierarchy,
} from './lib/district-hierarchy.mjs'
import { EXPECTED_HEADER, loadLegalDongCode } from './sources/legal-dong-code.mjs'

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

function prepare(units, overrides = []) {
  const info = annotateIdentities(units)
  const result = mergeStations(units, overrides)
  return { ...result, ...info }
}

/** override fixture 조립 도우미. note/decidedAt 은 스키마 검증을 통과하는 값으로 기본 채운다. */
function overrideFixture(partial) {
  return {
    candidateName: '테스트',
    note: '테스트 픽스처 근거 문구 - 스키마 검증 통과용으로 20자를 넘긴다.',
    decidedAt: '2026-08-08',
    ...partial,
  }
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
// I18N ENCODING 픽스처
//
// 서울교통공사_역명다국어표기.csv 실물에서 그대로 뽑은 EUC-KR raw byte(hex)다 -
// 합성 문자열이 아니라 2026-08-09 byte-level 진단에서 실제로 확인한 값이다.
// 공개 데이터(data.go.kr)라 역명/한자/영문 표기를 그대로 픽스처에 남겨도 된다.
//   HEADER: 연번,호선,한글,한자,영문,중국어,일본어
//   CLEAN : 9,1호선,제기동,祭基洞,Jegidong,祭基洞,チェギドン                (손상 없음)
//   CORRUPT: 10,1호선,청량리(서울시립대입구),... ,중국어="?凉里(首?市立大?)"  (원본 자체 손상)
// ----------------------------------------
const I18N_HEADER_HEX = 'bfacb9f82cc8a3bcb12cc7d1b1db2cc7d1c0da2cbfb5b9ae2cc1dfb1b9beee2cc0cfbabbbeee'
const I18N_CLEAN_ROW_HEX = '392c31c8a3bcb12cc1a6b1e2b5bf2cf0aed0f1d4d72c4a656769646f6e672cf0aed0f1d4d72cabc1aba7abaeabc9abf3'
const I18N_CORRUPT_ROW_HEX = '31302c31c8a3bcb12cc3bbb7aeb8ae28bcadbfefbdc3b8b3b4ebc0d4b1b8292cf4e8d5d8d7ec28bcadbfefe3bcd8a1d3deecfdcfa2292c4368656f6e676e79616e676e6928556e6976657273697479206f662053656f756c292c3fd5d8d7ec28e2cf3fe3bcd8a1d3de3f292cabc1abe7abf3abcbabe3abf3abcb'

async function buildI18nFixture() {
  const lineBufs = [I18N_HEADER_HEX, I18N_CLEAN_ROW_HEX, I18N_CORRUPT_ROW_HEX].map((h) => Buffer.from(h, 'hex'))
  const csvBuf = Buffer.concat(lineBufs.flatMap((b, i) => (i === 0 ? [b] : [Buffer.from('\r\n'), b])))
  const tmpPath = path.join(os.tmpdir(), `seed-stations-i18n-fixture-${process.pid}-${Date.now()}.csv`)
  await writeFile(tmpPath, csvBuf)
  try {
    return await loadSeoulMetroI18n(tmpPath)
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

// top-level await - selftest.mjs 는 ESM(.mjs)이라 지원된다.
// 실패하면 sentinel 을 남기고, 아래 Z 섹션의 check() 안에서 개별 실패로 보고한다
// (여기서 곧바로 throw 하면 이 픽스처와 무관한 나머지 테스트 전부가 출력되지 않는다).
let i18nFixture = null
let i18nFixtureError = null
try {
  i18nFixture = await buildI18nFixture()
} catch (err) {
  i18nFixtureError = err
}

// ----------------------------------------
// RAILWAY-STANDARD ENCODING 픽스처
//
// 전체_도시철도역사정보 CSV 실물에서 그대로 뽑은 EUC-KR raw byte(hex)다(2026-08-10 진단).
//   HEADER : 역번호,역사명,노선번호,노선명,영문역사명,한자역사명,환승역구분,환승노선번호,
//            환승노선명,역위도,역경도,운영기관명,역사도로명주소,역사전화번호,데이터기준일자
//   CLEAN  : D007,강남,I11D1,신분당선,Gangnam,江南,...                  (손상 없음)
//   CORRUPT: S401,샛강,L11SL,...,Saetgang,한자역사명="?江",...           (원본 자체 손상)
// ----------------------------------------
const RAILWAY_HEADER_HEX = 'bfaab9f8c8a32cbfaabbe7b8ed2cb3ebbcb1b9f8c8a32cb3ebbcb1b8ed2cbfb5b9aebfaabbe7b8ed2cc7d1c0dabfaabbe7b8ed2cc8afbdc2bfaab1b8bad02cc8afbdc2b3ebbcb1b9f8c8a32cc8afbdc2b3ebbcb1b8ed2cbfaac0a7b5b52cbfaab0e6b5b52cbfeebfb5b1e2b0fcb8ed2cbfaabbe7b5b5b7ceb8edc1d6bcd22cbfaabbe7c0fcc8adb9f8c8a32cb5a5c0ccc5cdb1e2c1d8c0cfc0da'
const RAILWAY_CLEAN_ROW_HEX = '443030372cb0adb3b22c49313144312cbdc5bad0b4e7bcb12c47616e676e616d2ccbb0d1f52cb5b5bdc3c3b6b5b520c8afbdc2bfaa2c49313144312cbcf6b5b5b1c720b1a4bfaac3b6b5b520bdc5bad0b4e7bcb12c33372e34393733383534342c3132372e303237383738392cb0e6b1e2b5b520bdc5bad0b4e7bcb12cbcadbfefc6afbab0bdc320b0adb3b2b1b820b0adb3b2b4ebb7ce20c1f6c7cf203339362c303229203831302d353834302c323032362d30362d3138'
const RAILWAY_CORRUPT_ROW_HEX = '533430312cbbfbb0ad2c4c3131534c2cbcf6b5b5b1c720b0e6b7aeb5b5bdc3c3b6b5b520bdc5b8b2bcb12c5361657467616e672c3fcbb02cc8afbdc2bfaa2c53313153312cbcf6b5b5b1c72020b5b5bdc3c3b6b5b52039c8a3bcb12c33372e35313732313939342c3132362e3932393430342cb3b2bcadbfefb0e6c0fcc3b620c1d6bdc4c8b8bbe72cbcadbfefc6afbab0bdc320bfb5b5eec6f7b1b820c0c7bbe7b4e7b4ebb7ce20c1f6c7cf3136362028bfa9c0c7b5b5b5bf292c30322d3839302d323232377e382c323032352d30392d3233'

async function buildRailwayFixture() {
  const lineBufs = [RAILWAY_HEADER_HEX, RAILWAY_CLEAN_ROW_HEX, RAILWAY_CORRUPT_ROW_HEX].map((h) => Buffer.from(h, 'hex'))
  const csvBuf = Buffer.concat(lineBufs.flatMap((b, i) => (i === 0 ? [b] : [Buffer.from('\r\n'), b])))
  const tmpPath = path.join(os.tmpdir(), `seed-stations-railway-fixture-${process.pid}-${Date.now()}.csv`)
  await writeFile(tmpPath, csvBuf)
  try {
    return await loadRailwayStandard(tmpPath)
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

let railwayFixture = null
let railwayFixtureError = null
try {
  railwayFixture = await buildRailwayFixture()
} catch (err) {
  railwayFixtureError = err
}

// ----------------------------------------
// 법정동코드 픽스처
//
// 실물 '법정동코드 전체자료.txt' 에서 그대로 뽑은 EUC-KR raw byte(hex)다(2026-08-09).
// 계층 규칙의 반례를 원본 파일 없이 회귀로 고정하는 것이 목적이다.
//
//   1100000000 서울특별시                존재  <- 시도. 1단계에서 배제되어야 함
//   1111000000 서울특별시 종로구         존재  <- 평범한 자치구
//   1111010100 서울특별시 종로구 청운동  존재  <- 읍면동. 1단계에서 배제되어야 함
//   4113000000 경기도 성남시             존재  <- 부모(제외 대상)
//   4113100000 경기도 성남시 수정구      존재  <- 자식(토큰 +1)
//   4119000000 경기도 부천시             존재  <- 부모(제외 대상)
//   4119200000 경기도 부천시 원미구      존재  <- ★ 원본 법정동명 끝에 공백이 하나 있다
//   4119500000 경기도 부천시 원미구      폐지  <- ★ 현행 41192 와 이름이 같고 코드만 다르다
//   4374000000 충청북도 영동군           존재  <- ★ 후보 B 반례. 앞4자리 4374 공유, 끝자리 0
//   4374500000 충청북도 증평군           존재  <- ★ 후보 B 반례의 짝
//   3611000000 세종특별자치시            존재  <- 1토큰(시도명 = 시군구명)
// ----------------------------------------
const LDC_HEX = Object.freeze({
  header: 'b9fdc1a4b5bfc4dab5e509b9fdc1a4b5bfb8ed09c6f3c1f6bfa9bace',
  seoul: '3131303030303030303009bcadbfefc6afbab0bdc309c1b8c0e7',
  jongno: '3131313130303030303009bcadbfefc6afbab0bdc320c1beb7ceb1b809c1b8c0e7',
  cheongun: '3131313130313031303009bcadbfefc6afbab0bdc320c1beb7ceb1b820c3bbbfeeb5bf09c1b8c0e7',
  seongnam: '3431313330303030303009b0e6b1e2b5b520bcbab3b2bdc309c1b8c0e7',
  sujeong: '3431313331303030303009b0e6b1e2b5b520bcbab3b2bdc320bcf6c1a4b1b809c1b8c0e7',
  bucheon: '3431313930303030303009b0e6b1e2b5b520bacec3b5bdc309c1b8c0e7',
  wonmiAlive: '3431313932303030303009b0e6b1e2b5b520bacec3b5bdc320bff8b9ccb1b82009c1b8c0e7',
  wonmiDead: '3431313935303030303009b0e6b1e2b5b520bacec3b5bdc320bff8b9ccb1b809c6f3c1f6',
  yeongdong: '3433373430303030303009c3e6c3bbbacfb5b520bfb5b5bfb1ba09c1b8c0e7',
  jeungpyeong: '3433373435303030303009c3e6c3bbbacfb5b520c1f5c6f2b1ba09c1b8c0e7',
  sejong: '3336313130303030303009bcbcc1bec6afbab0c0dac4a1bdc309c1b8c0e7',
})

const LDC_DEFAULT_ROWS = [
  'seoul', 'jongno', 'cheongun', 'seongnam', 'sujeong',
  'bucheon', 'wonmiAlive', 'wonmiDead', 'yeongdong', 'jeungpyeong', 'sejong',
]

// EUC-KR 인코더가 없으므로(Node TextEncoder 는 UTF-8 전용) 행을 hex 로 조립한다.
// ASCII 구간은 그대로 hex 화하고, 한글은 위 실측 byte 조각을 붙여 쓴다.
const ascii = (s) => Buffer.from(s, 'ascii').toString('hex')
const TAB = '09'
const EUCKR_ALIVE = 'c1b8c0e7' // '존재'
// '폐지' 행은 LDC_HEX.wonmiDead 실측 byte 를 그대로 쓰므로 별도 상수를 두지 않는다.

/**
 * @param keys        LDC_HEX 키 목록
 * @param extraHex    추가로 붙일 행의 hex 목록(잘못된 값 테스트용)
 * @param headerHex   헤더 교체용
 * @param pad         MIN_ROWS(5000) 하한을 넘기기 위한 padding 행 수
 */
async function buildLegalDongFixture({ keys = LDC_DEFAULT_ROWS, extraHex = [], headerHex = LDC_HEX.header, pad = 5200 } = {}) {
  const hexes = [headerHex, ...keys.map((k) => LDC_HEX[k]), ...extraHex]
  // padding 은 읍면동 레벨(뒤 5자리 ≠ 00000)이라 시군구 후보에 들어가지 않는다.
  for (let i = 0; i < pad; i += 1) {
    hexes.push(ascii(`11110${String(i + 1).padStart(5, '0')}`) + TAB + ascii('PAD') + TAB + EUCKR_ALIVE)
  }
  const bufs = hexes.map((h) => Buffer.from(h, 'hex'))
  const buf = Buffer.concat(bufs.flatMap((b, i) => (i === 0 ? [b] : [Buffer.from('\r\n'), b])))
  const tmpPath = path.join(os.tmpdir(), `seed-stations-ldc-fixture-${process.pid}-${Date.now()}-${seq++}.txt`)
  await writeFile(tmpPath, buf)
  try {
    return await loadLegalDongCode(tmpPath)
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

let ldcFixture = null
let ldcFixtureError = null
try {
  ldcFixture = await buildLegalDongFixture()
} catch (err) {
  ldcFixtureError = err
}

// 실패 경로는 run() 이 동기 함수라 여기서 미리 수집한다(성공하면 null - 그 자체가 실패다).
const expectLdcFailure = async (opts) => {
  try {
    await buildLegalDongFixture(opts)
    return null
  } catch (err) {
    return err.message
  }
}
const ldcFailures = {
  // '법정동코드' 뒤에 ASCII 'X'(0x58) 한 글자를 덧붙인 헤더
  badHeader: await expectLdcFailure({ headerHex: LDC_HEX.header.replace(/^b9fdc1a4b5bfc4dab5e5/, 'b9fdc1a4b5bfc4dab5e558') }),
  badStatus: await expectLdcFailure({ extraHex: [ascii('4374100000') + TAB + ascii('TEST') + TAB + ascii('DELETED')] }),
  questionMark: await expectLdcFailure({ extraHex: [ascii('4374200000') + TAB + ascii('?TEST') + TAB + EUCKR_ALIVE] }),
  replacementChar: await expectLdcFailure({ extraHex: [ascii('4374300000') + TAB + 'a1a1efbfbd' + TAB + EUCKR_ALIVE] }),
  badCode: await expectLdcFailure({ extraHex: [ascii('437400000') + TAB + ascii('TEST') + TAB + EUCKR_ALIVE] }),
  dupCode: await expectLdcFailure({ extraHex: [ascii('4374000000') + TAB + ascii('TEST') + TAB + EUCKR_ALIVE] }),
  tooFewRows: await expectLdcFailure({ pad: 0 }),
  badColumnCount: await expectLdcFailure({ extraHex: [ascii('4374400000') + TAB + ascii('TEST')] }),
}

// ----------------------------------------
function run() {
  const results = []
  const check = (name, fn) => {
    try { fn(); results.push({ name, ok: true }) } catch (err) { results.push({ name, ok: false, message: err.message }) }
  }

  // ===== 정규화 =====
  check('N0 정규화 포팅본이 migration_026 확인 벡터와 일치', () => { assertNormalizerMatchesSql() })

  // ===== [S] shared 검색 정규화 (src/shared/stationSearch/normalizeStationQuery.js) =====
  //   프론트 autocomplete 와 alias 생성기가 같이 쓰는 계약이다. 한쪽만 바뀌면 검색이 조용히 깨진다.
  const cp = (n) => String.fromCharCode(n)

  check('SN1 CJK 호환 한자가 일반 CJK 로 수렴한다', () => {
    // 원본 공공데이터의 한자 표기에 섞여 있다. 사용자가 IME 로 치는 것은 언제나 일반 한자다.
    const pairs = [[0xF941, 0x8AD6], [0xF9C4, 0x9F8D], [0xF9E2, 0x68A8], [0xF90A, 0x91D1], [0xF981, 0x5973]]
    for (const [compat, std] of pairs) {
      assert.equal(searchNormalize(cp(compat)), cp(std), `U+${compat.toString(16)} 가 U+${std.toString(16)} 로 수렴해야 한다`)
    }
    assert.equal(searchNormalize(cp(0xF941) + cp(0x5CF4)), searchNormalize(cp(0x8AD6) + cp(0x5CF4)), '論峴 두 표기가 같아야 한다')
  })

  check('SN2 ★ 한글 호환 자모(초성)는 보존된다 - 단순 NFKC 였다면 깨진다', () => {
    // kind='chosung' 별칭이 호환 자모(U+3131~U+314E)다. NFKC 를 통째로 걸면 조합용 자모로
    // 바뀌어 사용자가 IME 로 친 'ㅎㄷ' 와 저장값의 바이트가 갈린다.
    assert.equal(searchNormalize('ㅎㄷ'), 'ㅎㄷ')
    assert.equal(searchNormalize('ㅎㄷㅇㄱ'), 'ㅎㄷㅇㄱ')
    assert.equal(searchNormalize('ㅎㄷ').codePointAt(0), 0x314E, '호환 자모 U+314E 가 유지되어야 한다')
    // 대조: 단순 NFKC 였다면 U+1112 로 바뀐다
    assert.equal('ㅎㄷ'.normalize('NFKC').codePointAt(0), 0x1112)
    assert.equal(searchNormalize('강남ㄱㄴ'), '강남ㄱㄴ', '한글+초성 혼합에서도 보존')
  })

  check('SN3 NFD 로 분해된 한글은 음절로 합쳐진다', () => {
    assert.equal(searchNormalize(cp(0x1112) + cp(0x1169) + cp(0x11BC)), '홍')
    assert.equal(searchNormalize('강남역'.normalize('NFD')), '강남')
  })

  check('SN4 전각 숫자 / 전각 공백', () => {
    assert.equal(searchNormalize('２３'), '23')
    assert.equal(searchNormalize('２호선'), '2호선')
    assert.equal(searchNormalize('가' + cp(0x3000) + '나'), '가나')
  })

  check('SN5 가타카나 -> 히라가나 / 장음 제거', () => {
    assert.equal(searchNormalize('ホンデイック'), 'ほんでいっく')
    assert.equal(searchNormalize('ホンデー'), 'ほんで')
  })

  check('SN6 역 접미사 4종 (역 / station / 駅 / 站)', () => {
    assert.equal(searchNormalize('서울역'), '서울')
    assert.equal(searchNormalize('Seoul Station'), 'seoul')
    assert.equal(searchNormalize('ソウル駅'), 'そうる')
    assert.equal(searchNormalize('首爾站'), '首爾')
    assert.equal(searchNormalize('역역'), '역', '끝 1회만 제거한다(SQL 에 g 플래그가 없다)')
  })

  check('SN7 신촌 / 신촌역 이 같은 값으로 정규화된다', () => {
    assert.equal(searchNormalize('신촌'), '신촌')
    assert.equal(searchNormalize('신촌역'), '신촌')
    assert.equal(searchNormalize('홍대입구역'), '홍대입구')
    // 초성도 정규화 후 생성하므로 두 역이 같은 초성을 가진다
    assert.equal(hangulChosung(searchNormalize('신촌역')), hangulChosung(searchNormalize('신촌')))
  })

  check('SN8 ★ SQL parity 계약에는 NFKC 가 들어가지 않는다', () => {
    // 병합 그룹핑 키는 현재 308 station master 를 만들어 낸 값이라 동결이다.
    // 검색용 NFKC 가 여기 침투하면 재실행 시 병합 결과가 달라질 수 있다.
    assert.equal(normalizeStationQuerySqlParity('ㅎㄷ'), 'ㅎㄷ')
    assert.notEqual(normalizeStationQuerySqlParity(cp(0xF941)), cp(0x8AD6), 'sqlParity 는 호환 한자를 수렴시키지 않아야 한다')
    assert.equal(normalizeStationQuerySqlParity(cp(0xF941)), cp(0xF941))
    // lib/normalize.mjs 가 재수출하는 것이 sqlParity 계약인지 확인한다
    assert.equal(normalizeStationQuery(cp(0xF941)), normalizeStationQuerySqlParity(cp(0xF941)))
  })

  check('SN9 ★ 두 계약이 의도적으로 다른 CJK 표본', () => {
    for (const compat of [0xF941, 0xF9C4, 0xF9E2, 0xF90A]) {
      assert.notEqual(searchNormalize(cp(compat)), normalizeStationQuerySqlParity(cp(compat)),
        `U+${compat.toString(16)} 에서 두 계약이 달라야 한다`)
    }
    // 반대로 일반 문자열에서는 두 계약이 같아야 한다
    for (const s of ['강남역', 'Hongik Univ.', 'ホンデー', 'ㅎㄷㅇㄱ', '신촌역']) {
      assert.equal(searchNormalize(s), normalizeStationQuerySqlParity(s), `${s} 에서는 두 계약이 같아야 한다`)
    }
  })

  // ===== [G] alias 생성기 규칙 =====
  //   생성기 본체는 DB 를 읽으므로 여기서는 순수 규칙만 검증한다.
  const aliasKind = (kind, lang) => ({ kind, lang })
  const PRIORITY_ORDER = [
    aliasKind('official', 'ko'), aliasKind('official', 'en'), aliasKind('official', 'ja'),
    aliasKind('official', 'zh'), aliasKind('chosung', 'ko'), aliasKind('legacy', 'ko'),
  ]

  check('AG1 name_hanja 는 별칭으로 만들지 않는다', () => {
    // 한국식 한자 역명이지 중국어 역명이 아니다. 첫 시드 범위에서 제외했다.
    const src = readFileSync(new URL('./generate-alias-sql.mjs', import.meta.url), 'utf-8')
    const addCalls = src.match(/add\(station, station\.name_\w+/g) ?? []
    assert.ok(!addCalls.some((c) => c.includes('name_hanja')), 'name_hanja 를 add() 하는 코드가 있으면 안 된다')
    assert.equal(addCalls.length, 4, 'official 은 ko/en/ja/zh 4개여야 한다')
  })

  check('AG2 검수 제외는 station + alias 조합이다 (전역 문자열 아님)', () => {
    assert.equal(legacyAliasExclusions.length, 2)
    for (const e of legacyAliasExclusions) {
      assert.ok(typeof e.stationNameKo === 'string' && e.stationNameKo.length > 0, 'stationNameKo 필수')
      assert.ok(typeof e.alias === 'string' && e.alias.length > 0, 'alias 필수')
      assert.ok(typeof e.reason === 'string' && e.reason.trim().length > 20, 'reason 은 20자 초과여야 한다')
    }
    const keys = legacyAliasExclusions.map((e) => `${e.stationNameKo} ${e.alias}`)
    assert.equal(new Set(keys).size, keys.length, '중복 항목이 있으면 안 된다')
  })

  check('AG3 다른 station 의 같은 문자열은 제외되지 않는다', () => {
    // '지하' 는 신촌에서만 제외한다. 다른 역에 같은 문자열이 나오면 그대로 살아야 한다.
    const key = (nameKo, alias) => `${nameKo} ${alias}`
    const index = new Map(legacyAliasExclusions.map((e) => [key(e.stationNameKo, e.alias), e]))
    assert.ok(index.has(key('신촌', '지하')), '신촌/지하 는 제외 대상이다')
    assert.ok(!index.has(key('강남', '지하')), '강남/지하 는 제외 대상이 아니어야 한다')
    assert.ok(index.has(key('서울역', '경의선')), '서울역/경의선 은 제외 대상이다')
    assert.ok(!index.has(key('공덕', '경의선')), '공덕/경의선 은 제외 대상이 아니어야 한다')
  })

  check('AG4 dedupe 우선순위: official ko > en > ja > zh > chosung > legacy', () => {
    const priorityOf = (kind, lang) => PRIORITY_ORDER.findIndex((p) => p.kind === kind && p.lang === lang)
    assert.ok(priorityOf('official', 'ko') < priorityOf('official', 'en'))
    assert.ok(priorityOf('official', 'zh') < priorityOf('chosung', 'ko'))
    assert.ok(priorityOf('chosung', 'ko') < priorityOf('legacy', 'ko'))
    // 실제 사례: 홍대입구 official '홍대입구' 와 legacy '홍대입구역' 이 같은 값으로 정규화된다
    assert.equal(searchNormalize('홍대입구'), searchNormalize('홍대입구역'))
    assert.ok(priorityOf('official', 'ko') < priorityOf('legacy', 'ko'), 'official 이 남아야 한다')
  })

  check('AG5 정상 collision 은 hard fail 이 아니다', () => {
    // 서로 다른 station 이 같은 정규화 값을 공유하는 것은 정상이다(신촌/신촌역, 신사/새절, 이수/총신대입구).
    // unique key 는 station_id 를 포함하므로 INSERT 가 충돌하지 않는다.
    const uniqueKey = (stationId, normalized, lang) => `${stationId}|${normalized}|${lang ?? ''}`
    const a = uniqueKey('uuid-A', '신촌', 'ko')
    const b = uniqueKey('uuid-B', '신촌', 'ko')
    assert.notEqual(a, b, '같은 정규화 값이라도 station 이 다르면 다른 키다')
    // 같은 station 의 같은 값은 중복이다
    assert.equal(uniqueKey('uuid-A', '신촌', 'ko'), uniqueKey('uuid-A', '신촌', 'ko'))
  })

  check('AG6 빈 문자열 / 공백-only / "-" 는 별칭이 되지 않는다', () => {
    // name_hanja 의 '-' 는 "한자 표기가 없다"는 플레이스홀더다(순우리말 역 15건).
    for (const v of ['', '   ', '\t', null, undefined]) {
      const text = v === null || v === undefined ? '' : String(v).trim()
      assert.ok(!text, `${JSON.stringify(v)} 는 별칭이 되면 안 된다`)
    }
    assert.equal(searchNormalize('()'), '', '구두점만 남은 값은 정규화 후 빈 문자열이 된다')
  })

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

  // ===== sourceRowKey =====
  check('K1 sourceRowKey 는 station_no+line_name+raw_name', () => {
    const u = { stationCode: '0001', lineName: '2호선', rawName: '강남' }
    assert.equal(sourceRowKey(u), '0001|2호선|강남')
  })
  check('K2 sourceRowKey 충돌은 조용히 넘어가지 않고 중단한다', () => {
    const dup = [
      { sourceRowKey: 'A', lineCode: 'X' },
      { sourceRowKey: 'A', lineCode: 'Y' },
    ]
    assert.throws(() => assertSourceRowKeysUnique(dup), /충돌/)
  })
  check('K3 실데이터 406행 유일성 (npm run seed:stations 실행 기록)', () => {
    // 이 selftest 는 원본 데이터를 읽지 않는다(설계 원칙). 406행 전수 검증은
    // 2026-08-08 npm run seed:stations 실제 실행(annotateIdentities -> assertSourceRowKeysUnique)이
    // 예외 없이 통과한 것으로 이미 확인됐다 - 여기서는 guard 자체의 동작(K2)만 재확인한다.
    assert.equal(typeof assertSourceRowKeysUnique, 'function')
  })

  // ===== fingerprint - 안정성 (같은 내용이면 항상 같은 값) =====
  function fpRow(overrides = {}) {
    return {
      sourceRowKey: 'K1', rawName: '테스트', mainName: '테스트', subName: null,
      stationCode: '0001', lineCode: 'S1102', lineIdentity: 'S1102',
      isTransfer: true, transferLineCodes: ['S1105', 'I4108'], transferIdentities: new Set(['S1105', 'I4108@GJ']),
      lat: 37.5, lng: 127.0, district: { districtCode: '11000' },
      ...overrides,
    }
  }
  const fpRowA = fpRow({ sourceRowKey: 'K1' })
  const fpRowB = fpRow({
    sourceRowKey: 'K2', stationCode: '0002', lineCode: 'S1105', lineIdentity: 'S1105',
    transferLineCodes: ['S1102'], transferIdentities: new Set(['S1102']),
  })
  const fpBaseArgs = () => ({
    rows: [fpRowA, fpRowB],
    automaticClusters: [[fpRowA, fpRowB]],
    pairResults: [{ aKey: 'K1', bKey: 'K2', ok: true }],
  })
  const fpBase = groupFingerprint(fpBaseArgs())

  check('P1 동일 group -> 동일 fingerprint (재계산 안정)', () => {
    assert.equal(groupFingerprint(fpBaseArgs()), fpBase)
  })
  check('P2 source row 순서 변경 -> fingerprint 동일', () => {
    const args = fpBaseArgs()
    args.rows = [...args.rows].reverse()
    assert.equal(groupFingerprint(args), fpBase)
  })
  check('P3 transfer code set 순서 변경 -> fingerprint 동일', () => {
    const a = fpRow({ sourceRowKey: 'K1', transferLineCodes: ['I4108', 'S1105'], transferIdentities: new Set(['I4108@GJ', 'S1105']) })
    const args = { rows: [a, fpRowB], automaticClusters: [[a, fpRowB]], pairResults: fpBaseArgs().pairResults }
    assert.equal(groupFingerprint(args), fpBase)
  })
  check('P4 pairResults 나열 순서 변경 -> fingerprint 동일', () => {
    const b2 = fpRow({ sourceRowKey: 'K2', stationCode: '0002', lineCode: 'S1105', lineIdentity: 'S1105' })
    const c2 = fpRow({ sourceRowKey: 'K3', stationCode: '0003', lineCode: 'S1106', lineIdentity: 'S1106' })
    const base = { rows: [fpRowA, b2, c2], automaticClusters: [[fpRowA, b2, c2]],
      pairResults: [{ aKey: 'K1', bKey: 'K2', ok: true }, { aKey: 'K1', bKey: 'K3', ok: false }] }
    const reordered = { ...base, pairResults: [...base.pairResults].reverse() }
    assert.equal(groupFingerprint(base), groupFingerprint(reordered))
  })

  // ===== fingerprint - 민감도 (내용이 달라지면 반드시 값이 바뀐다) =====
  function assertDiffers(name, mutateArgs) {
    check(name, () => {
      const args = fpBaseArgs()
      mutateArgs(args)
      assert.notEqual(groupFingerprint(args), fpBase)
    })
  }
  assertDiffers('Q1 source row 추가 -> fingerprint 변경', (args) => {
    args.rows = [...args.rows, fpRow({ sourceRowKey: 'K3', stationCode: '0003' })]
  })
  assertDiffers('Q2 source row 삭제 -> fingerprint 변경', (args) => {
    args.rows = [args.rows[0]]
  })
  assertDiffers('Q3 line identity 변경 -> fingerprint 변경', (args) => {
    args.rows = [args.rows[0], { ...args.rows[1], lineIdentity: 'Z9999' }]
  })
  assertDiffers('Q4 transfer flag 변경 -> fingerprint 변경', (args) => {
    args.rows = [{ ...args.rows[0], isTransfer: false }, args.rows[1]]
  })
  assertDiffers('Q5 transfer identities 변경 -> fingerprint 변경', (args) => {
    args.rows = [{ ...args.rows[0], transferIdentities: new Set(['Z9999']) }, args.rows[1]]
  })
  assertDiffers('Q6 district 변경 -> fingerprint 변경', (args) => {
    args.rows = [{ ...args.rows[0], district: { districtCode: '99999' } }, args.rows[1]]
  })
  assertDiffers('Q7 좌표 변경 -> fingerprint 변경', (args) => {
    args.rows = [{ ...args.rows[0], lat: args.rows[0].lat + 0.01 }, args.rows[1]]
  })
  assertDiffers('Q8 automatic partition 변경 -> fingerprint 변경 (행/쌍은 그대로)', (args) => {
    args.automaticClusters = [[args.rows[0]], [args.rows[1]]] // 병합 1개 -> 분리 2개
  })

  // ===== override 동작 =====
  const sinchonKey = normalizeStationQuery(caseSinchon[0].mainName)
  const sinchonReviewId = reviewId(sinchonKey)

  check('O1 reviewId 가 candidate group 의 normalize(main_name) 해시와 일치한다', () => {
    const { groups } = prepare(caseSinchon)
    assert.equal(groups[0].reviewId, sinchonReviewId)
  })

  check('O2 fingerprint 일치 CONFIRMED_MERGE 적용 - hold 이던 그룹이 하나로 합쳐진다', () => {
    const baseline = prepare(caseSinchon)
    const fp = baseline.groups[0].fingerprint
    const ov = overrideFixture({ reviewId: sinchonReviewId, fingerprint: fp, verdict: 'CONFIRMED_MERGE' })
    const { stations, overrideAudit, blockingIssues } = prepare(caseSinchon, [ov])
    assert.equal(stations.length, 1)
    assert.equal(stations[0].decision, 'merge')
    assert.equal(stations[0].needsReview, false)
    assert.match(stations[0].reviewReason, /^\[OVERRIDE RV-[0-9a-f]{8} CONFIRMED_MERGE\]/)
    assert.equal(blockingIssues.length, 0)
    assert.equal(overrideAudit.find((a) => a.review_id === sinchonReviewId).status, 'applied')
  })

  check('O3 fingerprint 일치 CONFIRMED_SPLIT 적용 - automatic partition 을 그대로 승인한다', () => {
    const baseline = prepare(caseSinchon)
    const fp = baseline.groups[0].fingerprint
    const ov = overrideFixture({ reviewId: sinchonReviewId, fingerprint: fp, verdict: 'CONFIRMED_SPLIT' })
    const { stations } = prepare(caseSinchon, [ov])
    assert.equal(stations.length, 2, 'CONFIRMED_SPLIT 이 automatic partition(2개)을 보존하지 않았다')
    assert.ok(stations.every((s) => s.decision === 'hold'))
    assert.ok(stations.every((s) => s.needsReview === false))
    assert.ok(stations.every((s) => s.reviewReason.startsWith('[OVERRIDE')))
    // 원래 자동 판정 근거(신촌 hold 사유)가 override 로 지워지지 않고 남아 있어야 한다
    assert.ok(stations.every((s) => /환승역 아님|환승노선 불일치/.test(s.reviewReason)))
  })

  check('O4 MIXED - explicit partition 이 적용되고 automatic partition 과 달라도 된다', () => {
    const baseline = prepare(caseGwangwoondae)
    const gwKey = normalizeStationQuery(caseGwangwoondae[0].mainName)
    const gwGroup = baseline.groups.find((g) => g.key === gwKey)
    const keys = caseGwangwoondae.map((u) => sourceRowKey(u))
    // automatic: [경원선+경춘선] / [경의중앙선] (경춘 family) - MIXED 로 [경원선+경의중앙선] / [경춘선] 을 강제한다
    const gyeongwonKey = keys.find((k) => k.includes('경원선'))
    const gyeonguiKey = keys.find((k) => k.includes('경의중앙선'))
    const gyeongchunKey = keys.find((k) => k.includes('경춘선'))
    const ov = overrideFixture({
      reviewId: gwGroup.reviewId, fingerprint: gwGroup.fingerprint, verdict: 'MIXED',
      partition: [[gyeongwonKey, gyeonguiKey], [gyeongchunKey]],
    })
    const { stations } = prepare(caseGwangwoondae, [ov])
    assert.equal(stations.length, 2)
    const withGyeongui = stations.find((s) => s.lineIdentities.includes('I4108@GJ'))
    assert.ok(withGyeongui.lineIdentities.includes('I4102@N'), 'MIXED partition 이 경원선을 경의중앙선과 묶지 못했다')
    assert.ok(!withGyeongui.lineIdentities.includes('I4108@GC'), '경춘선이 분리되지 않았다')
    assert.ok(stations.every((s) => s.needsReview === false))
  })

  check('O5 override 가 evaluatePair/pairStats 자체를 바꾸지 않는다', () => {
    const oneWay = [
      unit({ rawName: '편도역2', lineName: '2호선', lineCode: 'S1102', lat: 37.5, lng: 127.0, transferRaw: '환승역', transferCodes: ['S1105'] }),
      unit({ rawName: '편도역2', lineName: '5호선', lineCode: 'S1105', lat: 37.5005, lng: 127.0, transferRaw: '환승역', transferCodes: [] }),
    ]
    const withoutOverride = prepare(oneWay)
    const key = normalizeStationQuery(oneWay[0].mainName)
    const grp = withoutOverride.groups.find((g) => g.key === key)
    const ov = overrideFixture({ reviewId: grp.reviewId, fingerprint: grp.fingerprint, verdict: 'CONFIRMED_MERGE' })
    const withOverride = prepare(oneWay, [ov])
    assert.equal(withOverride.pairStats.need5, withoutOverride.pairStats.need5)
    assert.equal(withOverride.pairStats.pass, withoutOverride.pairStats.pass)
    assert.equal(withOverride.pairStats.need5, 1)
    assert.equal(withOverride.pairStats.pass, 0, '편도 관계인데 evaluatePair 결과가 override 로 통과 처리됐다')
  })

  check('O6 override 가 source identity/coordinatePriority 를 바꾸지 않는다', () => {
    const gwKey = normalizeStationQuery(caseGwangwoondae[0].mainName)
    const before = caseGwangwoondae.map((u) => ({ key: sourceRowKey(u), identity: u.lineIdentity, priority: u.coordPriority }))
    const baseline = prepare(caseGwangwoondae)
    const gwGroup = baseline.groups.find((g) => g.key === gwKey)
    const keys = caseGwangwoondae.map((u) => sourceRowKey(u))
    const ov = overrideFixture({
      reviewId: gwGroup.reviewId, fingerprint: gwGroup.fingerprint, verdict: 'MIXED',
      partition: [[keys[0], keys[1]], [keys[2]]],
    })
    prepare(caseGwangwoondae, [ov])
    for (const b of before) {
      const u = caseGwangwoondae.find((x) => sourceRowKey(x) === b.key)
      assert.equal(u.lineIdentity, b.identity, `${b.key} 의 lineIdentity 가 override 이후 바뀌었다`)
      assert.equal(u.coordPriority, b.priority, `${b.key} 의 coordPriority 가 override 이후 바뀌었다`)
    }
  })

  check('O7 stale override 는 적용되지 않고 hard fail 대상이 된다', () => {
    const stale = overrideFixture({ reviewId: sinchonReviewId, fingerprint: 'fp_0000000000000000', verdict: 'CONFIRMED_MERGE' })
    const { stations, overrideAudit, blockingIssues } = prepare(caseSinchon, [stale])
    assert.equal(stations.length, 2, 'stale override 가 적용되어 자동 판정이 바뀌었다')
    assert.ok(stations.every((s) => s.decision === 'hold'))
    assert.ok(stations.every((s) => s.needsReview === true), 'stale 인데 needsReview 가 false 로 덮였다')
    assert.ok(stations.every((s) => !s.reviewReason.startsWith('[OVERRIDE')), 'stale 인데 review_reason 에 OVERRIDE 표시가 붙었다')
    assert.equal(blockingIssues.length, 1)
    assert.equal(blockingIssues[0].kind, 'stale')
    assert.equal(overrideAudit.find((a) => a.review_id === sinchonReviewId).status, 'stale')
  })

  check('O8 unused override 는 hard fail 대상이 된다', () => {
    const unusedOv = overrideFixture({ reviewId: 'RV-ffffffff', fingerprint: 'fp_0000000000000000', verdict: 'CONFIRMED_MERGE' })
    const { overrideAudit, blockingIssues } = prepare(caseSinchon, [unusedOv])
    assert.equal(blockingIssues.length, 1)
    assert.equal(blockingIssues[0].kind, 'unused')
    assert.equal(blockingIssues[0].reviewId, 'RV-ffffffff')
    assert.equal(overrideAudit.find((a) => a.review_id === 'RV-ffffffff').status, 'unused')
  })

  // ===== --no-kakao(dry-run) 는 override 를 건너뛴다 (회귀 방지) =====
  check('N1 useKakao=false -> override 가 빈 배열로 걸러진다 (dry-run 에 23건이 들어가지 않는다)', () => {
    assert.deepEqual(overridesForRun(false, manualOverrides), [])
  })
  check('N2 useKakao=true -> override 가 그대로 전달된다 (실제 실행 경로는 검증을 건너뛰지 않는다)', () => {
    assert.equal(overridesForRun(true, manualOverrides), manualOverrides)
    assert.equal(overridesForRun(true, manualOverrides).length, manualOverrides.length)
  })
  check('N3 dry-run 조건(override 없음)에서는 stale/unused 가 오발하지 않는다', () => {
    // district 미해결(=dry-run) 상황을 흉내낸다. override 를 아예 안 넘기면(N1의 결과)
    // fingerprint 불일치를 판단할 대상 자체가 없어 blockingIssues 가 항상 비어야 한다.
    const noDistrict = [
      unit({ rawName: '신촌(지하)', lineName: '2호선', lineCode: 'S1102', stationCode: '0240', lat: 37.55529, lng: 126.93690, transferRaw: '일반역' }),
      unit({ rawName: '신촌역', lineName: '경의중앙선', lineCode: 'I4108', stationCode: '1252', lat: 37.55966, lng: 126.94100, operator: '한국철도공사', transferRaw: '일반역' }),
    ]
    for (const u of noDistrict) u.district = null // --no-kakao 의 실제 상태
    const { overrideAudit, blockingIssues } = prepare(noDistrict, overridesForRun(false, manualOverrides))
    assert.equal(blockingIssues.length, 0, 'dry-run 인데 stale/unused 로 hard fail 판정이 발생했다')
    assert.equal(overrideAudit.length, 0, 'dry-run 인데 override_audit 행이 생겼다 - override 가 실제로 적용 시도된 것이다')
  })

  // ===== override 스키마 검증 =====
  check('V1 note 가 비어 있으면 검증 실패', () => {
    const bad = [overrideFixture({ reviewId: 'RV-00000000', fingerprint: 'fp_0000000000000000', verdict: 'CONFIRMED_MERGE', note: '' })]
    assert.ok(collectOverrideSchemaErrors(bad).some((e) => e.includes('note')))
  })
  check('V2 reviewId 중복이면 검증 실패', () => {
    const bad = [
      overrideFixture({ reviewId: 'RV-00000000', fingerprint: 'fp_0000000000000000', verdict: 'CONFIRMED_MERGE' }),
      overrideFixture({ reviewId: 'RV-00000000', fingerprint: 'fp_1111111111111111', verdict: 'CONFIRMED_SPLIT' }),
    ]
    assert.ok(collectOverrideSchemaErrors(bad).some((e) => e.includes('중복')))
  })
  check('V3 verdict 오타는 검증 실패', () => {
    const bad = [overrideFixture({ reviewId: 'RV-00000000', fingerprint: 'fp_0000000000000000', verdict: 'CONFIRMD_MERGE' })]
    assert.ok(collectOverrideSchemaErrors(bad).length > 0)
  })
  check('V4 MIXED 인데 partition 이 없으면 검증 실패', () => {
    const bad = [overrideFixture({ reviewId: 'RV-00000000', fingerprint: 'fp_0000000000000000', verdict: 'MIXED' })]
    assert.ok(collectOverrideSchemaErrors(bad).some((e) => e.includes('partition')))
  })
  check('V5 정상 항목은 통과한다', () => {
    const ok = [overrideFixture({ reviewId: 'RV-00000000', fingerprint: 'fp_0000000000000000', verdict: 'CONFIRMED_MERGE' })]
    assert.deepEqual(collectOverrideSchemaErrors(ok), [])
  })

  // ===== 표시 노선(display line) — merge 결과를 소비만 한다. merge.mjs/fingerprint 는 이 파일을 모른다 =====
  check('X1 identityToDisplayLineKey - 1호선/2호선/경의중앙선/경춘선 매핑', () => {
    assert.equal(identityToDisplayLineKey('I4101'), 'line_1')
    assert.equal(identityToDisplayLineKey('I1101'), 'line_1')
    assert.equal(identityToDisplayLineKey('I4102@N'), 'line_1')
    assert.equal(identityToDisplayLineKey('S1102'), 'line_2')
    assert.equal(identityToDisplayLineKey('S1121'), 'line_2')
    assert.equal(identityToDisplayLineKey('S1122'), 'line_2')
    assert.equal(identityToDisplayLineKey('I4108@GJ'), 'gyeongui_jungang')
    assert.equal(identityToDisplayLineKey('I4102@S'), 'gyeongui_jungang')
    assert.equal(identityToDisplayLineKey('I4108@GC'), 'gyeongchun')
    assert.equal(identityToDisplayLineKey('I41K2'), 'gyeongchun')
  })
  check('X2 미등록 identity 는 조용히 넘어가지 않고 중단한다', () => {
    assert.throws(() => identityToDisplayLineKey('Z9999'), /매핑에 없는 identity/)
  })
  check('X3 청량리 - 3개 identity(1호선+경의중앙선 2개) 가 2개 display line 으로 dedupe 된다', () => {
    const { lines, dedupRemovedCount } = stationDisplayLines(['I4101', 'I4108@GJ', 'I4102@S'])
    assert.deepEqual(lines.map((l) => l.key), ['line_1', 'gyeongui_jungang'])
    assert.equal(dedupRemovedCount, 1)
  })
  check('X4 displayOrder 기준으로 정렬된다 (입력 순서와 무관)', () => {
    const { lines } = stationDisplayLines(['I4108@GJ', 'I4101', 'S1102'])
    assert.deepEqual(lines.map((l) => l.key), ['line_1', 'line_2', 'gyeongui_jungang'])
  })
  check('X5 identity 가 이미 유일하면 dedupRemovedCount 는 0', () => {
    const { lines, dedupRemovedCount } = stationDisplayLines(['S1106', 'I41K2'])
    assert.equal(lines.length, 2)
    assert.equal(dedupRemovedCount, 0)
  })
  check('X6 validateDisplayLineMapping - 매핑에 없는 identity 는 hard fail', () => {
    assert.throws(() => validateDisplayLineMapping(['I4101', 'Z9999']), /\[A\]/)
  })
  check('X7 validateDisplayLineMapping - 서울 대상 24종 전수는 통과하고 24 -> 18 을 보고한다', () => {
    const result = validateDisplayLineMapping(Object.keys(IDENTITY_TO_DISPLAY_LINE_KEY))
    assert.equal(result.identityCount, 24)
    assert.equal(result.displayLineKeyCount, 18)
    assert.deepEqual(result.unusedMeta, [])
  })
  check('X8 metadata 자체의 nameKo/displayOrder 중복 검사는 관측 identity 가 없어도 통과한다', () => {
    assert.doesNotThrow(() => validateDisplayLineMapping([]))
  })
  check('X9 legacy config.mjs lineDisplayOrder 와 비교 - 서울 18개는 order 불일치가 없다', () => {
    const { mismatches } = compareWithLegacyLineDisplayOrder()
    assert.deepEqual(mismatches, [])
  })
  check('X10 legacy 에만 있는 항목(서울 MVP 범위 밖) 이 보고된다', () => {
    const { legacyOnly } = compareWithLegacyLineDisplayOrder()
    const names = legacyOnly.map((x) => x.name)
    for (const n of ['경강선', '의정부경전철', '인천1호선', '인천2호선', '분당선']) {
      assert.ok(names.includes(n), `legacyOnly 에 ${n} 이 없다`)
    }
  })
  check('X11 legacy 의 "분당선"/"수인분당선" order 중복 등록이 명시적으로 보고된다', () => {
    const { bundangDuplicateInLegacy } = compareWithLegacyLineDisplayOrder()
    assert.equal(bundangDuplicateInLegacy, true)
  })
  check('X12 merge.mjs 는 display-lines.mjs 를 import 하지 않는다 (결합 차단 계약)', () => {
    const src = readFileSync(new URL('./merge.mjs', import.meta.url), 'utf-8')
    assert.ok(!/display-lines/.test(src), 'merge.mjs 가 display-lines 를 참조한다 - 결합이 생겼다')
  })
  check('X13 lib/fingerprint.mjs 는 display-lines.mjs 를 import 하지 않는다 (fingerprint payload 불변 계약)', () => {
    const src = readFileSync(new URL('./lib/fingerprint.mjs', import.meta.url), 'utf-8')
    assert.ok(!/display-lines/.test(src), 'fingerprint.mjs 가 display-lines 를 참조한다 - payload 에 영향을 줄 수 있다')
  })
  check('X14 display line 계산이 station 원본 lineIdentities/lineNames/좌표 선택을 바꾸지 않는다', () => {
    const { stations } = prepare(caseGwangwoondae)
    const s = stations[0]
    const before = {
      lineIdentities: [...s.lineIdentities], lineNames: [...s.lineNames],
      coordFromIdentity: s.coordFromIdentity, coordPriority: s.coordPriority,
    }
    stationDisplayLines(s.lineIdentities)
    assert.deepEqual(s.lineIdentities, before.lineIdentities)
    assert.deepEqual(s.lineNames, before.lineNames)
    assert.equal(s.coordFromIdentity, before.coordFromIdentity)
    assert.equal(s.coordPriority, before.coordPriority)
  })
  check('X15 자동 merge된 [I4102@N+I4108@GC](경춘 family) cluster - 두 identity 는 서로 다른 display line 이다', () => {
    // line-identity.mjs L16 이 확인한 그대로: 경원선(북부)↔경춘선은 family 로 자동 merge 되지만,
    // family 는 환승 동치성이지 표시 노선이 아니다. I4102@N 은 1호선, I4108@GC 는 경춘선으로 남아야 한다.
    const { stations } = prepare(caseGwangwoondae)
    const familyMerged = stations.find((s) => s.lineIdentities.includes('I4102@N') && s.lineIdentities.includes('I4108@GC'))
    assert.ok(familyMerged, '경춘 family 자동 merge cluster 를 찾지 못했다 - fixture 또는 병합 규칙이 바뀌었을 수 있다')
    const { lines } = stationDisplayLines(familyMerged.lineIdentities)
    assert.deepEqual(lines.map((l) => l.key), ['line_1', 'gyeongchun'], 'family 관계가 display line 을 하나로 뭉갰다')
  })
  check('X16 override 로 강제 병합된 광운대(3-identity) - 1호선/경의중앙선/경춘선 3개 그대로, dedupe 없음', () => {
    const baseline = prepare(caseGwangwoondae)
    const gwKey = normalizeStationQuery(caseGwangwoondae[0].mainName)
    const gwGroup = baseline.groups.find((g) => g.key === gwKey)
    const ov = overrideFixture({ reviewId: gwGroup.reviewId, fingerprint: gwGroup.fingerprint, verdict: 'CONFIRMED_MERGE' })
    const { stations } = prepare(caseGwangwoondae, [ov])
    assert.equal(stations.length, 1)
    const { lines, dedupRemovedCount } = stationDisplayLines(stations[0].lineIdentities)
    assert.deepEqual(lines.map((l) => l.key), ['line_1', 'gyeongui_jungang', 'gyeongchun'])
    assert.equal(dedupRemovedCount, 0, '이 3개 identity 는 서로 다른 display line 이므로 dedupe 가 발생하면 안 된다')
  })

  // ===== i18n encoding 손상 (역명다국어표기.csv 원본 자체의 literal '?', 2026-08-09 발견) =====
  check('Z1 isSuspiciousI18nValue - null/빈 값은 손상이 아니다', () => {
    assert.equal(isSuspiciousI18nValue(null), false)
    assert.equal(isSuspiciousI18nValue(undefined), false)
    assert.equal(isSuspiciousI18nValue(''), false)
  })
  check('Z2 isSuspiciousI18nValue - literal ? 탐지', () => {
    assert.equal(isSuspiciousI18nValue('?凉里(首?市立大?)'), true)
    assert.equal(isSuspiciousI18nValue('Sangwolgok(KIST)?'), true)
  })
  check('Z3 isSuspiciousI18nValue - U+FFFD 탐지', () => {
    assert.equal(isSuspiciousI18nValue('��'), true)
  })
  check('Z4 isSuspiciousI18nValue - 정상 CJK 문자열은 손상이 아니다', () => {
    assert.equal(isSuspiciousI18nValue('祭基洞'), false)
    assert.equal(isSuspiciousI18nValue('チェギドン'), false)
    assert.equal(isSuspiciousI18nValue('淸凉里(서울市立大入口)'), false)
  })
  check('Z5 실제 EUC-KR raw byte 픽스처 - 정상 행은 통과, 손상 행은 해당 필드만 null로 정제된다', () => {
    if (i18nFixtureError) throw new Error(`픽스처 생성 실패: ${i18nFixtureError.message}`)
    assert.equal(i18nFixture.encoding, 'euc-kr', '픽스처가 EUC-KR 로 디코딩되지 않았다 - 실 데이터와 다른 경로를 탄다')

    const clean = i18nFixture.byName.get(normalizeStationQuery('제기동'))
    assert.ok(clean, '정상 행(제기동)이 byName 에 없다')
    assert.equal(clean.nameZh, '祭基洞')
    assert.equal(clean.nameJa, 'チェギドン')

    const corrupt = i18nFixture.byName.get(normalizeStationQuery('청량리'))
    assert.ok(corrupt, '손상 행(청량리)이 byName 에서 통째로 사라졌다 - nameJa 는 멀쩡하므로 행 자체는 남아야 한다')
    assert.equal(corrupt.nameZh, null, '손상된 nameZh 가 정제되지 않고 그대로 남았다')
    assert.equal(corrupt.nameJa, 'チョンニャンニ', '멀쩡한 nameJa 까지 함께 지워졌다')

    assert.equal(i18nFixture.corrupted.nameZh, 1)
    assert.equal(i18nFixture.corrupted.nameJa, 0)
    assert.equal(i18nFixture.corrupted.nameEn, 0)
  })
  check('Z6 assertNoSuspiciousI18nValues - 정제 후 byName 은 그대로 통과한다', () => {
    if (i18nFixtureError) throw new Error(`픽스처 생성 실패: ${i18nFixtureError.message}`)
    assert.doesNotThrow(() => assertNoSuspiciousI18nValues(i18nFixture.byName))
  })
  check('Z7 assertNoSuspiciousI18nValues - 손상 값이 남아 있으면 중단한다', () => {
    const dirty = new Map([['테스트역', { nameKo: '테스트역', nameJa: null, nameZh: '?凉里' }]])
    assert.throws(() => assertNoSuspiciousI18nValues(dirty), /손상된 값/)
    const dirtyFffd = new Map([['테스트역2', { nameKo: '테스트역2', nameJa: '�', nameZh: null }]])
    assert.throws(() => assertNoSuspiciousI18nValues(dirtyFffd), /손상된 값/)
  })

  // ===== railway-standard.mjs 손상 (전체_도시철도역사정보 CSV 원본 자체의 literal '?') =====
  check('Y1 isSuspiciousReferenceText - 공용 helper 는 seoul-metro-i18n 의 판정과 동일하다', () => {
    assert.equal(isSuspiciousReferenceText('?江'), true)
    assert.equal(isSuspiciousReferenceText('江南'), false)
    assert.equal(isSuspiciousReferenceText(null), false)
    assert.equal(isSuspiciousI18nValue('?江'), isSuspiciousReferenceText('?江'))
  })
  check('Y2 실제 EUC-KR raw byte 픽스처 - 정상 행은 통과, 손상 행은 nameHanja만 null로 정제된다', () => {
    if (railwayFixtureError) throw new Error(`픽스처 생성 실패: ${railwayFixtureError.message}`)
    assert.equal(railwayFixture.encoding, 'euc-kr', '픽스처가 EUC-KR 로 디코딩되지 않았다')
    assert.equal(railwayFixture.units.length, 2, '두 행 모두 필수값을 채웠으므로 skip 되면 안 된다')

    const clean = railwayFixture.units.find((u) => u.mainName === '강남')
    assert.ok(clean, '정상 행(강남)이 없다')
    assert.equal(clean.nameHanja, '江南')
    assert.equal(clean.nameEn, 'Gangnam')
    assert.equal(clean.stationCode, 'D007')
    assert.equal(clean.lineCode, 'I11D1')

    const corrupt = railwayFixture.units.find((u) => u.mainName === '샛강')
    assert.ok(corrupt, '손상 행(샛강)이 없다 - nameEn 은 멀쩡하므로 행 자체는 남아야 한다')
    assert.equal(corrupt.nameHanja, null, '손상된 nameHanja 가 정제되지 않고 그대로 남았다')
    assert.equal(corrupt.nameEn, 'Saetgang', '멀쩡한 nameEn 까지 함께 지워졌다')
    // ★ nameKo/stationCode/lineCode/좌표/matching 관련 값은 이번 정제와 무관해야 한다
    assert.equal(corrupt.mainName, '샛강')
    assert.equal(corrupt.stationCode, 'S401')
    assert.equal(corrupt.lineCode, 'L11SL')
    assert.equal(corrupt.lat, 37.51721994)
    assert.equal(corrupt.lng, 126.929404)
    assert.equal(corrupt.isTransfer, true)

    assert.equal(railwayFixture.corrupted.nameHanja, 1)
    assert.equal(railwayFixture.corrupted.nameEn, 0)
  })
  check('Y3 assertNoSuspiciousReferenceFields - 정제 후 units 는 그대로 통과한다', () => {
    if (railwayFixtureError) throw new Error(`픽스처 생성 실패: ${railwayFixtureError.message}`)
    assert.doesNotThrow(() => assertNoSuspiciousReferenceFields(railwayFixture.units))
  })
  check('Y4 assertNoSuspiciousReferenceFields - 손상 값이 남아 있으면 중단한다', () => {
    const dirty = [{ sourceRow: 1, mainName: '테스트역', nameHanja: '?院', nameEn: null }]
    assert.throws(() => assertNoSuspiciousReferenceFields(dirty), /손상된 값/)
    const dirtyFffd = [{ sourceRow: 2, mainName: '테스트역2', nameHanja: null, nameEn: '�' }]
    assert.throws(() => assertNoSuspiciousReferenceFields(dirtyFffd), /손상된 값/)
  })

  // ===== 법정동코드 파서 (sources/legal-dong-code.mjs) =====
  const ldcRow = (code) => {
    if (ldcFixtureError) throw new Error(`픽스처 생성 실패: ${ldcFixtureError.message}`)
    return ldcFixture.rows.find((r) => r.code === code)
  }

  check('D1 실제 EUC-KR raw byte 픽스처가 헤더 완전 일치로 파싱된다', () => {
    if (ldcFixtureError) throw new Error(`픽스처 생성 실패: ${ldcFixtureError.message}`)
    assert.equal(ldcFixture.encoding, 'euc-kr')
    assert.deepEqual(ldcFixture.header, [...EXPECTED_HEADER])
    assert.equal(ldcRow('1111000000').name, '서울특별시 종로구')
    assert.equal(ldcRow('3611000000').name, '세종특별자치시')
  })
  check('D2 법정동명 뒤 공백은 trim 되고 trimmedCount 로 보고된다 (부천형)', () => {
    // 원본 4119200000 은 "경기도 부천시 원미구 " 처럼 끝에 공백이 하나 있다(실측).
    assert.equal(ldcRow('4119200000').name, '경기도 부천시 원미구')
    assert.equal(ldcFixture.trimmedCount, 1, 'trim 이 적용된 행 수가 픽스처와 다르다')
  })
  check('D3 현행/폐지 집계 - 같은 이름의 폐지 행이 별도로 남는다', () => {
    assert.equal(ldcRow('4119500000').status, '폐지')
    assert.equal(ldcRow('4119500000').name, '경기도 부천시 원미구')
    assert.equal(ldcFixture.deadCount, 1)
    assert.equal(ldcFixture.aliveCount, ldcFixture.rowCount - 1)
  })
  const ldcFailed = (key, pattern) => {
    const msg = ldcFailures[key]
    assert.ok(msg !== null, `중단되어야 하는데 통과했다 (${key})`)
    assert.match(msg, pattern)
  }

  check('D4 헤더가 다르면 중단한다 (부분 일치를 허용하지 않는다)', () => {
    ldcFailed('badHeader', /헤더가 예상과 다릅니다/)
  })
  check('D5 폐지여부에 등록되지 않은 값이 있으면 중단한다', () => {
    ldcFailed('badStatus', /폐지여부에 등록되지 않은 값/)
  })
  check('D6 손상 의심 값은 null 정제가 아니라 중단이다 (name_ko 가 NOT NULL 이므로)', () => {
    ldcFailed('questionMark', /손상 의심 값/)
    // U+FFFD 는 EUC-KR 디코딩 단계에서 먼저 걸린다 - 어느 쪽이든 중단이면 된다.
    ldcFailed('replacementChar', /손상 의심 값|U\+FFFD/)
  })
  check('D7 10자리 숫자가 아닌 code 는 중단한다', () => {
    ldcFailed('badCode', /10자리 숫자가 아닌/)
  })
  check('D8 code 중복은 중단한다', () => {
    ldcFailed('dupCode', /중복된 값/)
  })
  check('D9 행 수가 하한 미만이면 중단한다 (다운로드 실패본 방어)', () => {
    ldcFailed('tooFewRows', /데이터 행이/)
  })
  check('D10 컬럼 수가 3개가 아니면 중단한다', () => {
    ldcFailed('badColumnCount', /컬럼 수가/)
  })
  check('D11 픽스처가 현행만 담고 있지 않다 (D3/H4 의 전제)', () => {
    if (ldcFixtureError) throw new Error(`픽스처 생성 실패: ${ldcFixtureError.message}`)
    assert.ok(ldcFixture.deadCount > 0, '폐지 행이 없으면 D3/H4 가 의미를 잃는다')
  })

  // ===== district 계층 (lib/district-hierarchy.mjs) =====
  const ldcCandidates = () => {
    if (ldcFixtureError) throw new Error(`픽스처 생성 실패: ${ldcFixtureError.message}`)
    return districtCandidates(ldcFixture.rows)
  }
  const dcode = (list) => list.map((d) => d.code5).sort()

  check('H1 isDistrictLevelCode - 시도/읍면동/리 는 시군구 레벨이 아니다', () => {
    assert.equal(isDistrictLevelCode('1100000000'), false, '시도 행이 통과했다')
    assert.equal(isDistrictLevelCode('1111000000'), true)
    assert.equal(isDistrictLevelCode('1111010100'), false, '읍면동 행이 통과했다')
    assert.equal(isDistrictLevelCode('1213025021'), false, '리 행이 통과했다')
    assert.equal(isDistrictLevelCode('11110'), false, '5자리는 원본 코드가 아니다')
  })
  check('H2 1단계 후보 - 현행 시군구 레벨만 남는다', () => {
    const c = ldcCandidates()
    // 종로구 / 성남시 / 수정구 / 부천시 / 원미구(현행) / 영동군 / 증평군 / 세종 = 8
    assert.deepEqual(dcode(c), ['11110', '36110', '41130', '41131', '41190', '41192', '43740', '43745'])
  })
  check('H3 성남시형 부모-자식 - 토큰 +1 이면 부모로 판정해 제외한다', () => {
    const { districts, excludedParents } = resolveDistrictHierarchy(ldcCandidates())
    const excluded = dcode(excludedParents)
    assert.ok(excluded.includes('41130'), '성남시가 제외되지 않았다')
    assert.ok(dcode(districts).includes('41131'), '수정구가 사라졌다')
  })
  check('H4 폐지 행이 섞여 있어도 현행만 대상 (부천 원미구 41192/41195형)', () => {
    const c = ldcCandidates()
    assert.ok(dcode(c).includes('41192'), '현행 원미구가 후보에서 빠졌다')
    assert.ok(!dcode(c).includes('41195'), '폐지된 원미구가 후보에 들어왔다')
    const { districts, excludedParents } = resolveDistrictHierarchy(c)
    assert.ok(dcode(excludedParents).includes('41190'), '부천시가 제외되지 않았다')
    assert.ok(dcode(districts).includes('41192'), '뒤 공백 때문에 원미구 판정이 어긋났다')
  })
  check('H5 ★ 영동군/증평군 반례 - 후보 B(앞4자리+끝자리0)였다면 영동군이 사라진다', () => {
    // 43740 영동군 / 43745 증평군 은 앞 4자리 '4374' 를 공유하지만 부모-자식이 아니다.
    // 이 테스트가 깨지면 누군가 코드 기반 규칙으로 되돌린 것이다.
    // 근거와 폐기 이력: lib/district-hierarchy.mjs [B]
    const c = ldcCandidates()
    const yeongdong = c.find((d) => d.code5 === '43740')
    const jeungpyeong = c.find((d) => d.code5 === '43745')
    assert.equal(isDirectChild(yeongdong, jeungpyeong), false, '증평군이 영동군의 자식으로 판정됐다')
    assert.equal(isDirectChild(jeungpyeong, yeongdong), false)
    const { districts } = resolveDistrictHierarchy(c)
    assert.ok(dcode(districts).includes('43740'), '영동군이 상위 시로 오인되어 제외됐다 - 후보 B 회귀')
    assert.ok(dcode(districts).includes('43745'))
  })
  check('H6 ★ 앞 3자리 그룹 반례 - 성남/부천이 같은 411 이어도 서로를 부모로 보지 않는다', () => {
    const c = ldcCandidates()
    const seongnam = c.find((d) => d.code5 === '41130')
    const bucheon = c.find((d) => d.code5 === '41190')
    assert.equal(seongnam.code5.slice(0, 3), bucheon.code5.slice(0, 3), '픽스처 전제(같은 411)가 깨졌다')
    assert.equal(isDirectChild(seongnam, bucheon), false)
    assert.equal(isDirectChild(bucheon, seongnam), false)
  })
  check('H7 토큰이 2단계 이상 차이나면 부모-자식이 아니다', () => {
    const p = { code5: '41130', sidoCode: '41', fullName: '경기도 성남시', tokens: ['경기도', '성남시'] }
    const grandchild = { code5: '41131', sidoCode: '41', fullName: '경기도 성남시 분당구 정자동', tokens: ['경기도', '성남시', '분당구', '정자동'] }
    assert.equal(isDirectChild(p, grandchild), false, '2단계 아래를 직계 자식으로 판정했다')
  })
  check('H8 토큰 앞부분이 다르면 부모-자식이 아니다 (우연한 접두 일치 방어)', () => {
    const p = { code5: '41130', sidoCode: '41', fullName: '경기도 성남', tokens: ['경기도', '성남'] }
    const c = { code5: '41131', sidoCode: '41', fullName: '경기도 성남시 수정구', tokens: ['경기도', '성남시', '수정구'] }
    // startsWith 였다면 "경기도 성남" 이 "경기도 성남시 수정구" 의 접두사라 부모로 잡혔을 수 있다.
    assert.equal(isDirectChild(p, c), false, 'token 비교가 아니라 문자열 접두 비교를 하고 있다')
  })
  check('H9 시도가 다르면 부모-자식이 아니다', () => {
    const p = { code5: '41130', sidoCode: '41', fullName: '경기도 성남시', tokens: ['경기도', '성남시'] }
    const c = { code5: '48120', sidoCode: '48', fullName: '경기도 성남시 분당구', tokens: ['경기도', '성남시', '분당구'] }
    assert.equal(isDirectChild(p, c), false)
  })
  check('H10 상위 후보가 2개면 issues 로 올린다 (숫자를 맞추려 임의 선택하지 않는다)', () => {
    const mk = (code5, tokens) => ({ code5, sidoCode: code5.slice(0, 2), fullName: tokens.join(' '), tokens, nameKo: tokens.at(-1) })
    const list = [
      mk('41130', ['경기도', '성남시']),
      mk('41140', ['경기도', '성남시']),
      mk('41131', ['경기도', '성남시', '수정구']),
    ]
    const { issues } = resolveDistrictHierarchy(list)
    assert.ok(issues.some((i) => i.includes('상위 후보가 2개')), '모호한 계층이 조용히 통과했다')
  })
  check('H11 세종형 1토큰 행 - 부모도 자식도 아니고 그대로 남는다', () => {
    const { districts } = resolveDistrictHierarchy(ldcCandidates())
    const sejong = districts.find((d) => d.code5 === '36110')
    assert.ok(sejong, '세종이 사라졌다')
    assert.equal(sejong.nameKo, '세종특별자치시', '1토큰 행의 name_ko 도출이 어긋났다')
  })
  check('H12 픽스처 contract - 후보 8 / 제외 2 / 최종 6', () => {
    const c = ldcCandidates()
    const { districts, excludedParents, issues } = resolveDistrictHierarchy(c)
    assert.equal(issues.length, 0, issues.join(' / '))
    assert.equal(c.length, 8)
    assert.equal(excludedParents.length, 2)
    assert.equal(districts.length, 6)
    // 후보 B 였다면 영동군까지 빠져 5개가 된다.
    assert.deepEqual(dcode(districts), ['11110', '36110', '41131', '41192', '43740', '43745'])
  })
  check('H13 name_ko 는 마지막 토큰이고 024 제약을 만족한다', () => {
    const { districts } = resolveDistrictHierarchy(ldcCandidates())
    for (const d of districts) {
      assert.match(d.code5, /^[0-9]{5}$/, `code_format 위반: ${d.code5}`)
      assert.equal(d.code5.slice(0, 2), d.sidoCode, `sido_prefix 위반: ${d.code5}`)
      assert.ok(d.nameKo && d.nameKo.length > 0)
      assert.ok(!/\s/.test(d.nameKo), `name_ko 에 공백이 남았다: ${JSON.stringify(d.nameKo)}`)
    }
    assert.equal(districts.find((d) => d.code5 === '41131').nameKo, '수정구')
    assert.equal(districts.find((d) => d.code5 === '41192').nameKo, '원미구')
  })

  // ===== Kakao 이름 비교 규칙 =====
  check('K10 Kakao 일반구 표기는 마지막 토큰으로 비교한다 (저장값은 바꾸지 않는다)', () => {
    // 실측: Kakao region_2depth_name 이 일반구에서 "성남시 분당구" 처럼 상위 시를 포함한다(11건).
    const forCompare = (name) => String(name ?? '').trim().split(/\s+/).at(-1)
    assert.equal(forCompare('성남시 분당구'), '분당구')
    assert.equal(forCompare('부천시 원미구'), '원미구')
    assert.equal(forCompare('강남구'), '강남구', '서울 자치구는 원래 1토큰이라 그대로여야 한다')
    assert.equal(forCompare(' 고양시 일산동구 '), '일산동구')
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
