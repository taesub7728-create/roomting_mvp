// 서울교통공사_역명 다국어 표기 (data.go.kr/data/15044232)
//
// 025 설계 의도에서 이 파일이 1차 출처인 값: name_ja / name_zh
// 커버리지는 서울교통공사 운영 노선(1~8호선 중심)뿐이다.
// 그 밖의 노선(공항철도/신분당선/경의중앙선 등)은 이 파일에 없고, 결손은 null 로 남긴다.
// ★ 추측해서 채우지 않는다(025 설계 의도 3). 폴백은 DB 조회 시점의 체인이 담당한다:
//     ja: name_ja -> name_hanja -> name_en -> name_ko
//     zh: name_zh -> name_hanja -> name_en -> name_ko

import { readCsv } from '../lib/csv.mjs'
import { pick, resolveColumns } from '../lib/columns.mjs'
import { normalizeStationQuery } from '../lib/normalize.mjs'
import { decomposeStationName } from './railway-standard.mjs'

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

  for (const row of rows) {
    const nameKo = pick(row, map, 'nameKo')
    if (!nameKo) continue

    // 표준데이터와 같은 기준으로 맞춘다: 주역명만 정규화한다.
    // (이 파일에는 현재 괄호 역명이 0건이지만 갱신본에 생길 수 있다)
    const key = normalizeStationQuery(decomposeStationName(nameKo).main)
    const nameJa = pick(row, map, 'nameJa')
    const nameZh = pick(row, map, 'nameZh')
    const nameEn = pick(row, map, 'nameEn')
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

  return { byName, conflicts, encoding, missingOptional, rowCount: rows.length }
}
