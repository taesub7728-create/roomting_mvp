// internal line identity(line-identity.mjs) -> 사용자-facing 표시 노선(displayLineKey) 매핑.
//
// ★ 이 파일은 merge.mjs가 import하지 않는다. (계약: selftest.mjs "X" 섹션 참고)
//   internal identity는 source 해석 / merge / transfer matching / coordinatePriority /
//   fingerprint 전용이며, 이 파일은 그 값을 읽기만 하고 절대 바꾸지 않는다.
//   display layer는 merge 결과(station.lineIdentities)를 소비만 한다.
//
// ★ 환승 동치성(line-identity.mjs의 transferCodeAdapter "service family")과
//   표시 노선은 별개 개념이다. transferCodeAdapter는 merge.mjs 규칙 (5)(환승 코드
//   매칭) 판정 전용이며, 두 identity가 같은 family라는 사실이 곧 같은 display line
//   이라는 뜻은 아니다.
//   예: I4102@N은 광운대역에서 경춘 계열(I4108@GC/I41K2)과 환승 관계(family)가
//   있지만, 실제 승객이 타는 운행 계통 기준으로는 1호선이다. 아래 매핑은 family가
//   아니라 승객이 타는 노선 기준으로만 정했다 — 2026-08-09 사람 확정.
//
// ★ displayLineKey는 seed script 내부의 안정적 식별자일 뿐이며 migration 025의
//   lines.name_en 등 실제 다국어 표기 컬럼값이 아니다. 영문 로마자화처럼 보여도
//   번역으로 쓰지 않는다(다국어 확정은 별도 단계, config.mjs 참고).
//   DB lines.id(uuid)를 여기 하드코딩하지 않는다 — 시드 실행마다 새로 생성되는
//   값이라 소스에 고정할 수 없다.
//
// 근거: 2026-08-09 서울(sidoCodes:['11']) 대상 24개 identity 전수 조사 결과
//       + 사람의 실제 노선 대조 확정.

import { lineDisplayOrder as legacyLineDisplayOrder } from '../config.mjs'

/** internal identity -> displayLineKey. 서울 대상 24종 전수. */
export const IDENTITY_TO_DISPLAY_LINE_KEY = {
  // --- 1호선 ---
  // 경부선(I4101)·경인선(I1101)·경원선 북부(I4102@N)는 1호선이 공용하는 선로의
  // 시설명이다. 창동(I4102@N)·온수(I1101)·종로3가(I4101) 모두 승객에게는 1호선 역.
  I4101: 'line_1',
  I1101: 'line_1',
  'I4102@N': 'line_1',

  // --- 2호선 ---
  // raw name "2호선" 리터럴 일치(본선/성수지선/신정지선).
  S1102: 'line_2',
  S1121: 'line_2',
  S1122: 'line_2',

  I1103: 'line_3',
  I1104: 'line_4',
  S1105: 'line_5',
  S1106: 'line_6',
  S1107: 'line_7',
  S1108: 'line_8',
  S1109: 'line_9',

  // --- 경의중앙선 ---
  // I4102@S(용산~청량리 구간, raw "경원선")는 전 구간 경의중앙선 역이다.
  // transferCodeAdapter의 I41K4 항목이 서울 19행 실측으로 같은 서비스임을 이미 확인해 둠
  // (line-identity.mjs). 그 실측은 환승 동치성 근거이고, 최종 판단은 사람이 확정했다.
  'I4108@GJ': 'gyeongui_jungang',
  'I4102@S': 'gyeongui_jungang',

  // --- 경춘선 ---
  // raw name "경춘선" 리터럴 일치.
  'I4108@GC': 'gyeongchun',
  I41K2: 'gyeongchun',

  // raw "분당선"이나 현재 코레일 안내 명칭은 수인분당선.
  I4105: 'suin_bundang',

  I11D1: 'sinbundang',

  // raw "인천국제공항선"은 시설명, 안내 명칭은 공항철도.
  I28A1: 'airport_railroad',

  I41WS: 'seohae',

  L11UI: 'uishinseol',

  // raw "수도권 경량도시철도 신림선"에서 사업 명칭 접두어를 제거.
  L11SL: 'sillim',

  // raw "김포도시철도"는 사업 명칭, 운영사 브랜드는 김포골드라인.
  L41G1: 'gimpo_gold',
}

/**
 * displayLineKey -> 표시 메타데이터.
 * displayOrder는 config.mjs의 (죽어있던) lineDisplayOrder와 동일한 값 체계를 쓴다
 * ([4] 비교 함수 참고). 24(경강선 자리)는 서울 MVP 범위 밖이라 의도적으로 비운다.
 */
export const DISPLAY_LINE_METADATA = {
  line_1: { key: 'line_1', nameKo: '1호선', displayOrder: 1 },
  line_2: { key: 'line_2', nameKo: '2호선', displayOrder: 2 },
  line_3: { key: 'line_3', nameKo: '3호선', displayOrder: 3 },
  line_4: { key: 'line_4', nameKo: '4호선', displayOrder: 4 },
  line_5: { key: 'line_5', nameKo: '5호선', displayOrder: 5 },
  line_6: { key: 'line_6', nameKo: '6호선', displayOrder: 6 },
  line_7: { key: 'line_7', nameKo: '7호선', displayOrder: 7 },
  line_8: { key: 'line_8', nameKo: '8호선', displayOrder: 8 },
  line_9: { key: 'line_9', nameKo: '9호선', displayOrder: 9 },
  gyeongui_jungang: { key: 'gyeongui_jungang', nameKo: '경의중앙선', displayOrder: 20 },
  suin_bundang: { key: 'suin_bundang', nameKo: '수인분당선', displayOrder: 21 },
  sinbundang: { key: 'sinbundang', nameKo: '신분당선', displayOrder: 22 },
  gyeongchun: { key: 'gyeongchun', nameKo: '경춘선', displayOrder: 23 },
  airport_railroad: { key: 'airport_railroad', nameKo: '공항철도', displayOrder: 25 },
  seohae: { key: 'seohae', nameKo: '서해선', displayOrder: 26 },
  uishinseol: { key: 'uishinseol', nameKo: '우이신설선', displayOrder: 30 },
  sillim: { key: 'sillim', nameKo: '신림선', displayOrder: 31 },
  gimpo_gold: { key: 'gimpo_gold', nameKo: '김포골드라인', displayOrder: 32 },
}

/** internal identity -> displayLineKey. 미등록 identity는 조용히 넘어가지 않고 중단한다. */
export function identityToDisplayLineKey(identity) {
  const key = IDENTITY_TO_DISPLAY_LINE_KEY[identity]
  if (!key) {
    throw new Error(`identityToDisplayLineKey: 매핑에 없는 identity "${identity}" 입니다.`)
  }
  return key
}

/** displayLineKey -> 표시 메타데이터. metadata에 없으면 중단한다. */
export function displayLineMetadata(key) {
  const meta = DISPLAY_LINE_METADATA[key]
  if (!meta) {
    throw new Error(`displayLineMetadata: metadata 에 없는 displayLineKey "${key}" 입니다.`)
  }
  return meta
}

/**
 * station.lineIdentities(merge.mjs buildStation() 산출물, 원본 그대로 둔다) 를
 * 입력받아 사용자-facing 표시 노선 목록을 계산한다.
 *
 * identity -> displayLineKey 변환 -> dedupe -> displayOrder 정렬. DB PK/ON CONFLICT에
 * 기대지 않는다 - dedupe는 이 함수(순수 함수, JS 레벨)가 책임진다.
 *
 * @param {string[]} lineIdentities
 * @returns {{ lines: {key:string,nameKo:string,displayOrder:number}[], dedupRemovedCount: number }}
 */
export function stationDisplayLines(lineIdentities) {
  const byKey = new Map()
  for (const identity of lineIdentities) {
    const key = identityToDisplayLineKey(identity)
    if (!byKey.has(key)) byKey.set(key, displayLineMetadata(key))
  }
  const lines = [...byKey.values()].sort((a, b) => a.displayOrder - b.displayOrder)
  return {
    lines,
    dedupRemovedCount: lineIdentities.length - lines.length,
  }
}

/**
 * [6] validation A/B/D/E/F. 전부 hard fail(예외 던짐).
 * C(사용되지 않는 metadata 항목)는 hard fail 대상이 아니라서 반환값으로만 보고한다.
 *
 * @param {Iterable<string>} seenIdentities  실제 실행에서 관측된 internal identity 집합
 *   (run.mjs/review-display-lines.mjs는 실데이터 전체를, selftest는 픽스처 단위를 넘긴다)
 */
export function validateDisplayLineMapping(seenIdentities) {
  const errors = []

  // A. 실제로 나타난 identity 전부가 매핑에 있는가
  const unmapped = [...new Set(seenIdentities)].filter((id) => !(id in IDENTITY_TO_DISPLAY_LINE_KEY))
  if (unmapped.length > 0) errors.push(`[A] 매핑에 없는 identity: ${unmapped.join(', ')}`)

  // B. 매핑이 가리키는 displayLineKey가 전부 metadata에 있는가
  const usedKeys = new Set(Object.values(IDENTITY_TO_DISPLAY_LINE_KEY))
  const missingMeta = [...usedKeys].filter((k) => !(k in DISPLAY_LINE_METADATA))
  if (missingMeta.length > 0) errors.push(`[B] metadata 없는 displayLineKey: ${missingMeta.join(', ')}`)

  // D. nameKo 빈값/중복
  const nameKoCounts = new Map()
  for (const [key, meta] of Object.entries(DISPLAY_LINE_METADATA)) {
    if (!meta.nameKo) errors.push(`[D] ${key}: nameKo 빈값`)
    nameKoCounts.set(meta.nameKo, (nameKoCounts.get(meta.nameKo) ?? 0) + 1)
  }
  const dupNameKo = [...nameKoCounts].filter(([, c]) => c > 1).map(([n]) => n)
  if (dupNameKo.length > 0) errors.push(`[D] nameKo 중복: ${dupNameKo.join(', ')}`)

  // E. displayOrder 중복 (서울 18개 범위)
  const orderCounts = new Map()
  for (const meta of Object.values(DISPLAY_LINE_METADATA)) {
    orderCounts.set(meta.displayOrder, (orderCounts.get(meta.displayOrder) ?? 0) + 1)
  }
  const dupOrder = [...orderCounts].filter(([, c]) => c > 1).map(([o]) => o)
  if (dupOrder.length > 0) errors.push(`[E] displayOrder 중복: ${dupOrder.join(', ')}`)

  if (errors.length > 0) {
    throw new Error(`display-lines validation 실패:\n${errors.map((e) => `  ${e}`).join('\n')}`)
  }

  // F. 24 identity -> 정확히 18 unique displayLineKey
  const identityCount = Object.keys(IDENTITY_TO_DISPLAY_LINE_KEY).length
  const displayLineKeyCount = usedKeys.size

  // C. metadata에는 있으나 이번 매핑에서 안 쓰이는 항목 (hard fail 아님, 보고용)
  const unusedMeta = Object.keys(DISPLAY_LINE_METADATA).filter((k) => !usedKeys.has(k))

  return { identityCount, displayLineKeyCount, unusedMeta }
}

/**
 * [4] 기존(죽어있던) config.mjs lineDisplayOrder 와의 프로그램적 비교.
 * 삭제/수정하지 않고 차이만 보고한다.
 */
export function compareWithLegacyLineDisplayOrder() {
  const seoulByNameKo = new Map(Object.values(DISPLAY_LINE_METADATA).map((m) => [m.nameKo, m]))

  const matches = []
  const mismatches = []
  const legacyOnly = []

  for (const [name, order] of Object.entries(legacyLineDisplayOrder)) {
    const meta = seoulByNameKo.get(name)
    if (!meta) {
      legacyOnly.push({ name, legacyOrder: order })
      continue
    }
    if (meta.displayOrder === order) matches.push({ name, order })
    else mismatches.push({ name, legacyOrder: order, newOrder: meta.displayOrder })
  }

  // config.mjs:90-91 — "분당선"과 "수인분당선"이 같은 order(21)로 중복 등록된 기존 상태.
  const bundangDuplicateInLegacy =
    legacyLineDisplayOrder['분당선'] !== undefined &&
    legacyLineDisplayOrder['수인분당선'] !== undefined &&
    legacyLineDisplayOrder['분당선'] === legacyLineDisplayOrder['수인분당선']

  return { matches, mismatches, legacyOnly, bundangDuplicateInLegacy }
}
