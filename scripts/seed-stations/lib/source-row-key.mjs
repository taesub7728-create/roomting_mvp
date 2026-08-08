// 원본 source row(표준데이터 CSV 한 줄) 를 가리키는 deterministic key.
// MIXED override 의 partition 과 fingerprint 양쪽에서 "행 하나"를 지칭하는 유일한 방법이다.
// array index 는 쓰지 않는다 - 파일 재다운로드로 행 순서가 바뀌면 조용히 다른 행을 가리키게 된다.
//
// 조합: station_no(stationCode) + raw 노선명(lineName) + raw 역명(rawName)
//
// ★ 조합 근거 (2026-08-08, 서울 대상 실측 406행 전수 검증)
//   station_no + line_code + raw_name 은 I4108 name-split 3건에서 충돌한다
//   (광운대역/중랑역/상봉역 - 경의중앙선/경춘선이 같은 lineCode=I4108, 같은 stationCode를 공유).
//   line_code 대신 line_name 을 쓰면 그 3건이 갈라져 406행 전수 충돌 0건이었다.
//   station_no + line_name 만으로는 이수/총신대입구(이수) 1건이 충돌하므로 raw_name 이 반드시 필요하다.
//
//   resolved line identity(lineIdentity)를 쓰지 않는 이유: identity 해석 규칙(segment/name split
//   경계값 등)이 나중에 바뀌면 이 key 도 같이 흔들려서, override 의 MIXED partition 이 identity
//   해석 로직 변경과 무관하게 깨질 수 있다. 원본 데이터 필드만으로 구성해 그 결합을 끊는다.
const DELIM = '|'

export function sourceRowKey(unit) {
  const parts = [unit.stationCode, unit.lineName, unit.rawName]
  for (const p of parts) {
    if (String(p ?? '').includes(DELIM)) {
      throw new Error(`sourceRowKey 구성 필드에 구분자 "${DELIM}" 가 포함되어 있습니다: ${JSON.stringify(p)}`)
    }
  }
  return parts.join(DELIM)
}

/**
 * 대상 units 전수에서 sourceRowKey 유일성을 검증한다.
 * 충돌이 있으면 조용히 넘어가지 않고 중단한다 - override 의 MIXED partition 과
 * fingerprint 가 서로 다른 행을 같은 행으로 착각하게 되기 때문이다.
 */
export function assertSourceRowKeysUnique(units) {
  const seen = new Map()
  const collisions = []
  for (const u of units) {
    const k = u.sourceRowKey ?? sourceRowKey(u)
    if (seen.has(k)) collisions.push({ key: k, a: seen.get(k), b: u })
    else seen.set(k, u)
  }
  if (collisions.length > 0) {
    throw new Error(
      [
        `sourceRowKey 충돌 ${collisions.length}건 - override/fingerprint 가 행을 구분할 수 없습니다.`,
        ...collisions.map((c) => `  ${c.key}  (${c.a.lineCode} / ${c.b.lineCode})`),
        '',
        'lib/source-row-key.mjs 의 조합 필드를 재검토하십시오.',
      ].join('\n'),
    )
  }
}
