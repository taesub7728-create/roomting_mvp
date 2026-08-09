// 행정안전부 행정표준코드 법정동코드 전체자료 (code.go.kr)
//
// migration_024 districts 의 유일한 source-of-truth 다.
//
// ★ 이 파일은 "원본 파일의 내용"만 해석한다.
//   source / source_version 같은 provenance metadata 는 여기에 두지 않는다 - 그 값들은
//   파일에서 읽은 것이 아니라 우리가 정책으로 부여한 것이라, generate-districts-sql.mjs 가
//   상수로 들고 있다. 다른 snapshot 파일을 파싱할 때 이 파서를 고치지 않아도 되게 한다.
//
// ★ 실측 (2026-08-09, byte-level)
//   BOM 없음 / EUC-KR / CRLF 53,388 / 탭 구분 / 헤더 1행 + 데이터 53,387행
//   컬럼 3개: 법정동코드 | 법정동명 | 폐지여부
//   법정동코드 전부 10자리 숫자, 중복 0 / 폐지여부 {존재 20,560 , 폐지 32,827}
//   literal '?'(0x3F) 0건 / U+FFFD 0건 / control char 0건
//   법정동명 뒤 공백 4건(부천 원미·소사·오정구 + 여주 대신면) -> trim 대상
//
// ★ 어제 두 CSV(역명다국어표기 / 전체_도시철도역사정보)와 결정적으로 다른 점:
//   그 둘은 원본 자체에 손상(0x3F)이 있어 손상 값을 null 로 "정제"했다.
//   이 파일은 손상이 0건이고, 무엇보다 districts.name_ko 가 NOT NULL 이다.
//   정제 = 시드 불가이므로, 손상을 발견하면 정제하지 않고 중단한다.

import { readFile } from 'node:fs/promises'
import { isSuspiciousReferenceText } from '../lib/reference-text-quality.mjs'

// 헤더는 부분 일치/순서 무관 매칭을 하지 않는다. 컬럼이 추가되거나 순서가 바뀌었는데
// 조용히 잘못된 컬럼을 읽는 것이 이 파일에서 가장 나쁜 결과다.
export const EXPECTED_HEADER = Object.freeze(['법정동코드', '법정동명', '폐지여부'])

// 실측 2종. 목록 밖 값이 나오면 조용히 폐지로 분류하지 않고 중단한다 -
// 새 상태값이 생겼는데 폐지로 넘기면 district 가 소리 없이 사라진다.
// (railway-standard.mjs 의 환승역구분 처리와 같은 이유·같은 패턴이다.)
export const STATUS_ALIVE = '존재'
export const STATUS_DEAD = '폐지'
const STATUS_VALUES = new Set([STATUS_ALIVE, STATUS_DEAD])

// 다운로드 실패본(빈 파일/에러 페이지)을 조용히 통과시키지 않기 위한 하한.
// 실측 53,387 행의 1/10 로 잡았다 - 정확한 행 수를 고정하면 갱신본마다 깨진다.
const MIN_ROWS = 5000

// 탭/CR/LF 는 split 으로 이미 소비됐으므로, 남아 있으면 그 자체가 이상이다.
// oxlint-disable-next-line no-control-regex -- control character 탐지가 이 정규식의 목적이다.
const CONTROL_CHAR = /[\u0000-\u001F]/

function fail(lines) {
  throw new Error(['법정동코드 전체자료를 신뢰할 수 없어 중단합니다.', '', ...lines].join('\n'))
}

/**
 * @returns {{ rows, header, rowCount, aliveCount, deadCount, trimmedCount, encoding }}
 *   rows: { code, name, status, line } - name 은 trim 된 값이다.
 */
export async function loadLegalDongCode(filePath) {
  const buf = await readFile(filePath)

  // BOM: 실측 없음. 있으면 인코딩 가정이 깨진 것이므로 중단한다.
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fail(['UTF-8 BOM 이 있습니다. EUC-KR 전제가 깨졌습니다.'])
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) {
    fail(['UTF-16 BOM 이 있습니다. EUC-KR 전제가 깨졌습니다.'])
  }

  const text = new TextDecoder('euc-kr').decode(buf)

  // EUC-KR 디코딩 실패는 곧 파일이 바뀌었다는 뜻이다(실측 0건).
  const fffd = (text.match(/�/g) ?? []).length
  if (fffd > 0) {
    fail([
      `EUC-KR 로 디코딩했더니 U+FFFD 가 ${fffd}건 나왔습니다.`,
      '실측(2026-08-09)은 0건이었습니다. 원본 파일의 인코딩이 바뀌었는지 확인하십시오.',
    ])
  }

  const rawLines = text.split('\r\n')
  if (rawLines.at(-1) === '') rawLines.pop()
  if (rawLines.length === 0) fail(['빈 파일입니다.'])

  const header = rawLines[0].split('\t').map((h) => h.trim())
  if (header.length !== EXPECTED_HEADER.length || header.some((h, i) => h !== EXPECTED_HEADER[i])) {
    fail([
      '헤더가 예상과 다릅니다(완전 일치를 요구합니다).',
      `  예상: ${EXPECTED_HEADER.join(' | ')}`,
      `  실제: ${header.join(' | ')}`,
      '',
      '컬럼이 추가되었거나 순서가 바뀌었다면, 조용히 잘못된 컬럼을 읽지 않도록',
      'sources/legal-dong-code.mjs 의 EXPECTED_HEADER 와 파싱을 함께 고치십시오.',
    ])
  }

  const rows = []
  const badColumnCount = []
  const badCode = []
  const badStatus = []
  const corrupted = []
  const controlChars = []
  let trimmedCount = 0

  for (const [i, raw] of rawLines.slice(1).entries()) {
    const line = i + 2
    const cols = raw.split('\t')
    if (cols.length !== EXPECTED_HEADER.length) {
      badColumnCount.push({ line, count: cols.length, raw: raw.slice(0, 120) })
      continue
    }

    const code = cols[0].trim()
    const rawName = cols[1]
    const name = rawName.trim()
    const status = cols[2].trim()
    if (name !== rawName) trimmedCount += 1

    if (!/^[0-9]{10}$/.test(code)) badCode.push({ line, code })
    if (!STATUS_VALUES.has(status)) badStatus.push({ line, code, status })
    // ★ 정제하지 않는다. districts.name_ko 는 NOT NULL 이라 정제 = 시드 불가다.
    if (isSuspiciousReferenceText(name)) corrupted.push({ line, code, name })
    if (CONTROL_CHAR.test(name)) controlChars.push({ line, code, name: JSON.stringify(name) })

    rows.push({ code, name, status, line })
  }

  if (badColumnCount.length > 0) {
    fail([
      `컬럼 수가 ${EXPECTED_HEADER.length}개가 아닌 행이 ${badColumnCount.length}건 있습니다.`,
      ...badColumnCount.slice(0, 10).map((b) => `  ${b.line}행: ${b.count}개 - ${b.raw}`),
    ])
  }
  if (badCode.length > 0) {
    fail([
      `법정동코드가 10자리 숫자가 아닌 행이 ${badCode.length}건 있습니다.`,
      ...badCode.slice(0, 10).map((b) => `  ${b.line}행: ${JSON.stringify(b.code)}`),
    ])
  }
  if (badStatus.length > 0) {
    const distinct = [...new Set(badStatus.map((b) => b.status))]
    fail([
      `폐지여부에 등록되지 않은 값이 ${badStatus.length}행 있습니다.`,
      `  등록된 값: "${STATUS_ALIVE}" , "${STATUS_DEAD}"`,
      `  발견된 값: ${distinct.map((v) => JSON.stringify(v)).join(' , ')}`,
      ...badStatus.slice(0, 10).map((b) => `  ${b.line}행 ${b.code} -> ${JSON.stringify(b.status)}`),
      '',
      '조용히 폐지로 분류하면 해당 district 가 시드에서 사라집니다.',
      '원천 표기가 바뀌었는지 확인한 뒤 STATUS_ALIVE / STATUS_DEAD 를 고치십시오.',
    ])
  }
  if (corrupted.length > 0) {
    fail([
      `법정동명에 손상 의심 값(literal '?' 또는 U+FFFD)이 ${corrupted.length}행 있습니다.`,
      ...corrupted.slice(0, 20).map((c) => `  ${c.line}행 ${c.code}: ${JSON.stringify(c.name)}`),
      '',
      "★ 여기서는 손상 값을 null 로 정제하지 않습니다. districts.name_ko 가 NOT NULL 이라",
      '  정제하면 그 행을 시드할 수 없고, 행정구역명에 ? 가 정상적으로 들어갈 일도 없습니다.',
      '  원본을 다시 받거나 원천 손상을 확인한 뒤 진행하십시오.',
    ])
  }
  if (controlChars.length > 0) {
    fail([
      `법정동명에 control character 가 ${controlChars.length}행 있습니다.`,
      ...controlChars.slice(0, 10).map((c) => `  ${c.line}행 ${c.code}: ${c.name}`),
    ])
  }

  const dup = new Map()
  for (const r of rows) dup.set(r.code, (dup.get(r.code) ?? 0) + 1)
  const dupCodes = [...dup.entries()].filter(([, n]) => n > 1)
  if (dupCodes.length > 0) {
    fail([
      `법정동코드가 중복된 값이 ${dupCodes.length}종 있습니다.`,
      ...dupCodes.slice(0, 10).map(([c, n]) => `  ${c} x${n}`),
    ])
  }

  if (rows.length < MIN_ROWS) {
    fail([
      `데이터 행이 ${rows.length}행뿐입니다(하한 ${MIN_ROWS}).`,
      '다운로드가 중간에 끊겼거나 에러 페이지를 받았을 수 있습니다.',
    ])
  }

  const aliveCount = rows.filter((r) => r.status === STATUS_ALIVE).length

  return {
    rows,
    header,
    rowCount: rows.length,
    aliveCount,
    deadCount: rows.length - aliveCount,
    trimmedCount,
    encoding: 'euc-kr',
  }
}
