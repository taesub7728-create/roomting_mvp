// 헤더 이름 매핑.
//
// data.go.kr 표준데이터는 갱신 때마다 컬럼명이 조금씩 달라진다('역사명'/'역명', '선명'/'노선명').
// 컬럼명을 코드에 박아두면 다음 갱신본에서 조용히 빈 값이 들어오고, 그 결과가 좌표 없는 역이나
// 환승 판정 실패로 나타난다. 그래서 후보 목록으로 찾고, 못 찾으면 실제 헤더를 전부 출력하며 중단한다.
// "값이 비었네"가 아니라 "매핑이 없네"로 실패하게 만드는 것이 목적이다.

function normalizeHeader(h) {
  return h.replace(/[\s_()[\]]/g, '').toLowerCase()
}

/**
 * @param {string[]} headers   실제 CSV 헤더
 * @param {object} spec        { 논리필드명: { candidates: string[], required: boolean, hint?: string } }
 * @param {string} sourceLabel 에러 메시지에 쓸 파일 설명
 * @returns {{ map: Record<string,string|null>, missingOptional: string[] }}
 *          map[논리필드] = 실제 헤더명 (없으면 null)
 */
export function resolveColumns(headers, spec, sourceLabel) {
  const normalized = new Map()
  for (const h of headers) {
    const key = normalizeHeader(h)
    if (!normalized.has(key)) normalized.set(key, h)
  }

  const map = {}
  const missingRequired = []
  const missingOptional = []

  for (const [field, { candidates, required, hint }] of Object.entries(spec)) {
    let found = null

    // 1차: 정규화 후 완전 일치
    for (const cand of candidates) {
      const hit = normalized.get(normalizeHeader(cand))
      if (hit) {
        found = hit
        break
      }
    }

    // 2차: 부분 일치. 후보가 실제 헤더에 포함되거나 그 반대인 경우.
    // 유일하게 걸릴 때만 채택한다 - 둘 이상이면 어느 쪽인지 확정할 수 없으므로 없는 것으로 본다.
    if (!found) {
      for (const cand of candidates) {
        const c = normalizeHeader(cand)
        const hits = [...normalized.entries()].filter(([k]) => k.includes(c) || c.includes(k))
        if (hits.length === 1) {
          found = hits[0][1]
          break
        }
      }
    }

    map[field] = found
    if (!found) {
      if (required) missingRequired.push({ field, candidates, hint })
      else missingOptional.push(field)
    }
  }

  if (missingRequired.length > 0) {
    const detail = missingRequired
      .map(({ field, candidates, hint }) =>
        `  - ${field}${hint ? ` (${hint})` : ''}\n      찾아본 이름: ${candidates.join(', ')}`,
      )
      .join('\n')
    throw new Error(
      [
        `${sourceLabel} 에서 필수 컬럼을 찾지 못했습니다.`,
        detail,
        '',
        '실제 파일의 헤더:',
        headers.map((h) => `  ${h}`).join('\n'),
        '',
        'lib/columns.mjs 를 고치는 게 아니라, 해당 sources/*.mjs 의 COLUMN_SPEC 후보 목록에',
        '위 실제 헤더명을 추가하십시오.',
      ].join('\n'),
    )
  }

  return { map, missingOptional }
}

/** resolveColumns 결과로 행에서 값을 꺼낸다. 매핑이 없으면 null. */
export function pick(row, map, field) {
  const header = map[field]
  if (!header) return null
  const value = row[header]
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}
