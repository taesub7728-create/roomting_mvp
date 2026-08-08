// 서울교통공사_역명 다국어 표기 (data.go.kr/data/15044232)
//
// 025 설계 의도에서 이 파일이 1차 출처인 값: name_ja / name_zh
// 커버리지는 서울교통공사 운영 노선(1~8호선 중심)뿐이다.
// 그 밖의 노선(공항철도/신분당선/경의중앙선 등)은 이 파일에 없고, 결손은 null 로 남긴다.
// ★ 추측해서 채우지 않는다(025 설계 의도 3). 폴백은 DB 조회 시점의 체인이 담당한다:
//     ja: name_ja -> name_hanja -> name_en -> name_ko
//     zh: name_zh -> name_hanja -> name_en -> name_ko
//
// ★ 원본 CSV 손상 (2026-08-09 byte-level 진단으로 확정)
//   중국어(및 일부 일본어/영문) 컬럼에 원본 파일 자체에 이미 ASCII '?'(0x3F)가 저장된
//   행이 있다. EUC-KR 디코딩은 전체 파일에서 U+FFFD 0건으로 완전히 성공한다 - 즉
//   디코더 실패가 아니라, 우리가 이 파일을 받기 전에 이미 다른 곳(공공데이터 발행
//   과정으로 추정)에서 EUC-KR/CP949로 옮길 수 없는 문자가 '?'로 대체된 상태다.
//   디코더를 바꿔도 복구되지 않는다(어떤 인코딩으로 봐도 0x3F는 ASCII '?'다).
//   그래서 이 파일을 손상된 필드의 authoritative source로 쓸 수 없고, 손상된 개별
//   값은 "결손"과 동일하게 취급해 null로 둔다 - 025 설계 의도 3과 같은 정책이다.
//   추정 복구(예: '?'를 지우고 나머지만 쓰기)는 하지 않는다 - 부분 문자열도 신뢰할
//   근거가 없다.

import { readCsv } from '../lib/csv.mjs'
import { pick, resolveColumns } from '../lib/columns.mjs'
import { isSuspiciousReferenceText } from '../lib/reference-text-quality.mjs'
import { normalizeStationQuery } from '../lib/normalize.mjs'
import { decomposeStationName } from './railway-standard.mjs'

// railway-standard.mjs(전체_도시철도역사정보)도 같은 손상 패턴을 가져서(2026-08-10 진단)
// 판정 로직을 lib/reference-text-quality.mjs 로 공용화했다. 이 이름은 기존 호출부
// (selftest.mjs/generate-seed-sql.mjs) 호환을 위해 그대로 유지한다.
export const isSuspiciousI18nValue = isSuspiciousReferenceText

const COLUMN_SPEC = {
  stationCode: {
    required: false,
    candidates: ['역번호', '전철역코드', '역사코드', '고유역번호', '역코드'],
  },
  nameKo: {
    required: true,
    candidates: ['역명', '한글역명', '전철역명', '역사명', '역명한글'],
    hint: '역 한글명 - 표준데이터와 이 값으로 맞춘다',
  },
  nameEn: {
    required: false,
    candidates: ['영문역명', '역명영문', '전철역명영문', '영문명'],
  },
  nameJa: {
    required: false,
    candidates: ['일문역명', '역명일문', '일본어역명', '일문명', '전철역명일본어', '일본어'],
  },
  nameZh: {
    required: false,
    candidates: ['중문역명', '역명중문', '중국어역명', '중문명', '전철역명중국어', '중국어'],
  },
  lineName: {
    required: false,
    candidates: ['호선', '노선명', '선명'],
  },
}

/**
 * 표준데이터에 붙일 ja/zh 조회표를 만든다.
 * 키는 정규화 역명이다(원문 표기가 '서울역'/'서울' 처럼 흔들려도 같은 키로 모인다).
 */
export async function loadSeoulMetroI18n(filePath) {
  const { headers, rows, encoding } = await readCsv(filePath)
  const { map, missingOptional } = resolveColumns(headers, COLUMN_SPEC, '서울교통공사 역명다국어표기')

  if (!map.nameJa && !map.nameZh) {
    throw new Error(
      [
        '서울교통공사 역명다국어표기에서 일문/중문 컬럼을 하나도 찾지 못했습니다.',
        '이 파일을 읽는 유일한 이유가 ja/zh 이므로 중단합니다.',
        '',
        '실제 헤더:',
        headers.map((h) => `  ${h}`).join('\n'),
        '',
        'sources/seoul-metro-i18n.mjs 의 COLUMN_SPEC 에 위 헤더명을 추가하십시오.',
      ].join('\n'),
    )
  }

  // key -> { nameJa, nameZh, variants:Set<string> }
  const byName = new Map()
  const conflicts = []
  // 손상된 값을 결손(null)으로 대체한 건수. nameKo는 정제하지 않는다 - 조인 키(주역명)는
  // decomposeStationName().main 이 쓰는데, 실측 확인 결과 손상은 항상 괄호 안 부역명
  // 쪽에서만 나타나 조인 키에는 영향이 없다(예: "남한산성입구(성남법원?검찰청)" -> main은
  // "남한산성입구"로 멀쩡하다). nameKo 자체를 지우면 멀쩡한 nameJa/nameZh 까지 함께
  // 버리게 되므로 하지 않는다.
  const corrupted = { nameJa: 0, nameZh: 0, nameEn: 0 }

  for (const row of rows) {
    const nameKo = pick(row, map, 'nameKo')
    if (!nameKo) continue

    // 표준데이터와 같은 기준으로 맞춘다: 주역명만 정규화한다.
    // (이 파일에는 현재 괄호 역명이 0건이지만 갱신본에 생길 수 있다)
    const key = normalizeStationQuery(decomposeStationName(nameKo).main)
    let nameJa = pick(row, map, 'nameJa')
    let nameZh = pick(row, map, 'nameZh')
    let nameEn = pick(row, map, 'nameEn')
    // ★ 원본 손상 값은 결손과 동일하게 null 로 둔다(추정 복구하지 않는다 - 파일 상단 주석 참고).
    if (isSuspiciousI18nValue(nameJa)) { corrupted.nameJa += 1; nameJa = null }
    if (isSuspiciousI18nValue(nameZh)) { corrupted.nameZh += 1; nameZh = null }
    if (isSuspiciousI18nValue(nameEn)) { corrupted.nameEn += 1; nameEn = null }
    if (!nameJa && !nameZh && !nameEn) continue

    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { nameKo, nameJa, nameZh, nameEn, variants: new Set([nameKo]) })
      continue
    }

    existing.variants.add(nameKo)

    // 같은 역명에 다른 ja/zh 가 오면 먼저 읽은 값을 유지하고 리포트에 남긴다.
    // 조용히 덮어쓰면 어느 값이 살아남았는지 알 수 없다.
    for (const field of ['nameJa', 'nameZh', 'nameEn']) {
      const incoming = { nameJa, nameZh, nameEn }[field]
      if (!incoming) continue
      if (!existing[field]) {
        existing[field] = incoming
      } else if (existing[field] !== incoming) {
        conflicts.push({ key, nameKo, field, kept: existing[field], dropped: incoming })
      }
    }
  }

  // [7] 정제 후 재확인 - 정제 로직 자체가 깨졌다면(예: isSuspiciousI18nValue 를 빠뜨린
  //   새 필드 추가 등) 손상된 값이 byName 에 남아 있을 수 있다. 조용히 넘어가지 않는다.
  assertNoSuspiciousI18nValues(byName)

  return { byName, conflicts, corrupted, encoding, missingOptional, rowCount: rows.length }
}

/** [7] byName 조회표에 손상된(literal '?' 또는 U+FFFD) nameJa/nameZh 가 하나도 없는지 확인한다. */
export function assertNoSuspiciousI18nValues(byName) {
  for (const [key, v] of byName) {
    if (isSuspiciousI18nValue(v.nameJa) || isSuspiciousI18nValue(v.nameZh)) {
      throw new Error(
        `loadSeoulMetroI18n: 정제 후에도 손상된 값이 남아 있습니다 (key="${key}", ` +
        `nameJa=${JSON.stringify(v.nameJa)}, nameZh=${JSON.stringify(v.nameZh)}). ` +
        '정제 로직(isSuspiciousI18nValue 적용 누락 등)을 확인하십시오.',
      )
    }
  }
}
