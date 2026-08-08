// 전국도시철도역사정보표준데이터 (국가철도공단, data.go.kr/data/15013205)
//
// 025 설계 의도에서 이 파일이 1차 출처인 값:
//   좌표 / name_en / name_hanja / 환승역 구분(병합 규칙 4) / 환승 노선(병합 규칙 5) / 운영기관
//
// 이 파일의 한 행 = "한 역의 한 노선"이다. 환승역은 노선 수만큼 행이 있다.
//
// ★ 원본 CSV 손상 (2026-08-10 byte-level 진단으로 확정, sources/seoul-metro-i18n.mjs와
//   같은 원인 - 서로 다른 파일이지만 판정 기준은 lib/reference-text-quality.mjs 로 공용화)
//   한자역사명/영문역사명 컬럼에 원본 파일 자체에 이미 ASCII '?'(0x3F)가 저장된 행이
//   있다(전국 1099행 중 한자 53행/영문 4행). EUC-KR 디코딩은 전체 파일에서 U+FFFD 0건 -
//   디코더 실패가 아니라 원본 데이터 자체의 손실이다. 손상된 개별 값은 결손과 동일하게
//   null 로 둔다(025 설계 의도 3). 역사명(nameKo)도 전국 2건 손상이 있지만 전부 괄호 안
//   부역명에만 있고("용산(서부법원?검찰청입구)"/대구, "하남시청(덕풍?신장)"/경기) 둘 다
//   서울 대상 밖이며 mainName(조인 키)에는 영향이 없어 정제하지 않는다 - 실측 확인함.

import { readCsv } from '../lib/csv.mjs'
import { pick, resolveColumns } from '../lib/columns.mjs'
import { isSuspiciousReferenceText } from '../lib/reference-text-quality.mjs'
import { normalizeStationQuery } from '../lib/normalize.mjs'

// ========================================
// [A] 환승역 구분
//
// ★ Y/N 이 아니다. 실데이터 확인값(전국 1099행)은 아래 4종이고 목록 밖 값은 0행이었다.
//   startsWith('Y') 같은 느슨한 판정을 쓰면 한글 값이 전부 false 가 되어
//   규칙 (4)가 100% 실패하고 병합이 한 건도 일어나지 않는다(실제로 그렇게 됐었다).
//   목록 밖 값이 나오면 조용히 false 로 넘기지 않고 중단한다 - 원천 형식 변경을 놓치면
//   같은 사고가 조용히 재발한다.
// ========================================
export const TRANSFER_VALUES_TRUE = Object.freeze(['환승역', '도시철도 환승역'])
export const TRANSFER_VALUES_FALSE = Object.freeze(['일반역', '도시철도 일반역'])

const TRUE_SET = new Set(TRANSFER_VALUES_TRUE)
const FALSE_SET = new Set(TRANSFER_VALUES_FALSE)

/** @returns {true|false|'unknown'} */
export function parseTransferFlag(rawValue) {
  const v = (rawValue ?? '').trim()
  if (TRUE_SET.has(v)) return true
  if (FALSE_SET.has(v)) return false
  return 'unknown'
}

// ========================================
// [B] 환승 노선 토큰 분리
//
// 실데이터에 존재하는 구분자 전체를 지원한다:
//   '+'      "수도권  광역철도 4호선+수도권  광역철도 경의중앙"
//   ','      "1호선, 4호선, 인천국제공항선, GTX-A"
//   개행     환승노선번호 2행 / 환승노선명 2행에서 확인
//   공백만   "서울 도시철도 5호선 인천국제공항선 김포골드라인 서해선"
//
// 공백만으로 나뉜 경우는 이름 쪽에서만 나타나고 노선명 자체가 공백을 포함해서
// 안전하게 나눌 수 없다. 그래서 이름은 identity 판정의 주 기준으로 쓰지 않고
// 진단·검수용으로만 원문을 보존한다. 판정은 항상 코드로 한다.
// ========================================
const TOKEN_SPLIT = /[+,/·|\r\n\t]+/

export function splitTokens(value) {
  if (!value) return []
  return value
    .split(TOKEN_SPLIT)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s !== '' && s !== '-')
}

// ========================================
// [D] 주역명 / 부역명 분해
//
// 표준데이터 역사명은 `주역명(부역명)` 규격이다. 서울 대상 64개 괄호 역명의
// 괄호 안 내용이 전부 유일했다 - 반복되는 시설 수식어 패턴이 아니라 부역명 필드다.
//
// 괄호를 "삭제"하는 게 아니라 "구조화"한다. sub_name 은 버리지 않고 alias 후보로 남긴다.
//   총신대입구(이수)        -> main=총신대입구,        sub=이수
//   동대문역사문화공원(DDP) -> main=동대문역사문화공원, sub=DDP
//   신촌(지하)              -> main=신촌,              sub=지하
//
// ★ (지하) 를 특례 처리하지 않는다. 신촌 두 행은 같은 candidate group 에 들어간 뒤
//   환승 관계가 없다는 이유로 규칙 (4)(5)에서 hold 가 되어야 한다.
//   역명으로 병합 여부를 가르는 분기를 두지 않는다.
// ========================================
const PAREN = /^(.*?)[(（]([^)）]*)[)）]\s*$/

export function decomposeStationName(rawName) {
  const m = String(rawName).match(PAREN)
  if (!m || m[1].trim() === '') return { raw: rawName, main: rawName, sub: null }
  return { raw: rawName, main: m[1].trim(), sub: m[2].trim() }
}

const COLUMN_SPEC = {
  stationCode: {
    required: true,
    candidates: ['역번호', '역코드', '철도역코드', '역사코드', '전철역코드'],
    hint: '역번호 - I4102 구간 분할 기준이라 필수다',
  },
  nameKo: {
    required: true,
    candidates: ['역사명', '역명', '철도역명', '전철역명', '역이름'],
    hint: '역 한글명',
  },
  nameEn: { required: false, candidates: ['영문역사명', '영문역명', '역사명영문', '영문명'] },
  nameHanja: { required: false, candidates: ['한자역사명', '한자역명', '역사명한자', '한자명'] },
  lineName: {
    required: true,
    candidates: ['선명', '노선명', '철도노선명', '호선'],
    hint: '노선명 - I4108 분리 기준',
  },
  lineCode: {
    required: true,
    candidates: ['노선번호', '철도노선코드', '노선코드'],
    hint: '노선번호 - line identity 의 기본값이라 필수다',
  },
  operator: { required: false, candidates: ['운영기관명', '철도운영기관명', '기관명'] },
  isTransfer: {
    required: true,
    candidates: ['환승역구분', '환승역여부', '환승구분'],
    hint: '환승역 구분 - 병합 규칙 (4)',
  },
  transferLineNames: {
    required: false,
    candidates: ['환승노선명', '환승노선', '환승노선명칭'],
  },
  transferLineCodes: {
    required: true,
    candidates: ['환승노선번호', '환승노선코드'],
    hint: '환승노선번호 - 병합 규칙 (5)의 유일한 판정 근거',
  },
  latitude: { required: true, candidates: ['역위도', '위도', 'latitude', 'lat'], hint: 'WGS84 위도' },
  longitude: { required: true, candidates: ['역경도', '경도', 'longitude', 'lng', 'lon'], hint: 'WGS84 경도' },
  roadAddress: { required: false, candidates: ['소재지도로명주소', '도로명주소', '역사도로명주소'] },
  baseDate: { required: false, candidates: ['데이터기준일자', '기준일자', '데이터기준일'] },
}

function parseCoord(value) {
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function loadRailwayStandard(filePath) {
  const { headers, rows, encoding } = await readCsv(filePath)
  const { map, missingOptional } = resolveColumns(headers, COLUMN_SPEC, '전국도시철도역사정보표준데이터')

  const units = []
  const skipped = []
  const unknownTransferValues = []
  let baseDate = null
  // 손상된 값을 결손(null)으로 대체한 건수(전국 기준). 위 주석 참고 - 정제하지 않는다:
  // nameKo/stationCode/lineCode/좌표/matching 값.
  const corrupted = { nameHanja: 0, nameEn: 0 }

  for (const [index, row] of rows.entries()) {
    const line = index + 2
    const rawName = pick(row, map, 'nameKo')
    const lineName = pick(row, map, 'lineName')
    const lineCode = pick(row, map, 'lineCode')
    const lat = parseCoord(pick(row, map, 'latitude'))
    const lng = parseCoord(pick(row, map, 'longitude'))

    if (!baseDate) baseDate = pick(row, map, 'baseDate')

    if (!rawName || !lineName || !lineCode || lat === null || lng === null) {
      skipped.push({ line, rawName, lineName, reason: '필수값 결손' })
      continue
    }
    if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
      skipped.push({ line, rawName, lineName, reason: '좌표 범위 밖' })
      continue
    }

    const transferRaw = pick(row, map, 'isTransfer')
    const transfer = parseTransferFlag(transferRaw)
    if (transfer === 'unknown') {
      // 여기서 모아 두고 파싱이 끝난 뒤 한꺼번에 중단한다. 첫 건에서 바로 죽으면
      // 값이 몇 종류나 바뀐 건지 알 수 없다.
      unknownTransferValues.push({ line, rawName, lineName, value: transferRaw })
      continue
    }

    const name = decomposeStationName(rawName)

    // ★ 원본 손상 값은 결손과 동일하게 null 로 둔다(추정 복구하지 않는다 - 파일 상단 주석 참고).
    let nameEn = pick(row, map, 'nameEn')
    let nameHanja = pick(row, map, 'nameHanja')
    if (isSuspiciousReferenceText(nameEn)) { corrupted.nameEn += 1; nameEn = null }
    if (isSuspiciousReferenceText(nameHanja)) { corrupted.nameHanja += 1; nameHanja = null }

    units.push({
      source: 'railway-standard',
      sourceRow: line,
      stationCode: pick(row, map, 'stationCode'),

      // [D] 이름 3종. raw/sub 는 버리지 않는다.
      rawName: name.raw,
      mainName: name.main,
      subName: name.sub,
      mainNameNormalized: normalizeStationQuery(name.main),

      nameEn,
      nameHanja,
      nameJa: null,
      nameZh: null,

      lineName,
      lineCode,
      operator: pick(row, map, 'operator'),

      isTransfer: transfer,
      isTransferRaw: transferRaw,

      transferLineCodes: splitTokens(pick(row, map, 'transferLineCodes')),
      // 판정에 쓰지 않는다. 검수 리포트와 진단용으로만 보존한다.
      transferLineNamesRaw: pick(row, map, 'transferLineNames'),

      lat,
      lng,
      roadAddress: pick(row, map, 'roadAddress'),
      district: null, // Kakao 역변환으로 채운다. [C] 그룹핑에는 쓰지 않는다
    })
  }

  if (unknownTransferValues.length > 0) {
    const distinct = [...new Set(unknownTransferValues.map((u) => u.value))]
    throw new Error(
      [
        `환승역구분에 등록되지 않은 값이 ${unknownTransferValues.length}행 있습니다. 병합 규칙 (4)를 판정할 수 없어 중단합니다.`,
        '',
        `  등록된 true  값: ${TRANSFER_VALUES_TRUE.join(' , ')}`,
        `  등록된 false 값: ${TRANSFER_VALUES_FALSE.join(' , ')}`,
        `  발견된 미등록 값: ${distinct.map((v) => `"${v}"`).join(' , ')}`,
        '',
        '  예시 행:',
        ...unknownTransferValues.slice(0, 10).map((u) => `    ${u.line}행  ${u.rawName} / ${u.lineName}  -> "${u.value}"`),
        '',
        '원천 데이터의 표기가 바뀌었는지 확인한 뒤 sources/railway-standard.mjs 의',
        'TRANSFER_VALUES_TRUE / TRANSFER_VALUES_FALSE 에 추가하십시오.',
        '조용히 false 로 넘기면 해당 역이 전부 병합되지 않습니다.',
      ].join('\n'),
    )
  }

  // 정제 후 재확인 - 정제 로직 자체가 깨지면(예: 새 nullable 참조 필드 추가 시
  // isSuspiciousReferenceText 적용을 빠뜨리는 경우) 손상된 값이 units 에 남을 수 있다.
  assertNoSuspiciousReferenceFields(units)

  return { units, skipped, encoding, baseDate, corrupted, missingOptional, rowCount: rows.length }
}

/** 정제 후 units 에 손상된(literal '?' 또는 U+FFFD) nameHanja/nameEn 이 하나도 없는지 확인한다. */
export function assertNoSuspiciousReferenceFields(units) {
  for (const u of units) {
    if (isSuspiciousReferenceText(u.nameHanja) || isSuspiciousReferenceText(u.nameEn)) {
      throw new Error(
        `loadRailwayStandard: 정제 후에도 손상된 값이 남아 있습니다 (sourceRow=${u.sourceRow}, ` +
        `mainName="${u.mainName}", nameHanja=${JSON.stringify(u.nameHanja)}, nameEn=${JSON.stringify(u.nameEn)}). ` +
        '정제 로직(isSuspiciousReferenceText 적용 누락 등)을 확인하십시오.',
      )
    }
  }
}
