// CSV 읽기/쓰기. 의존성을 추가하지 않는다(1회성 스크립트에 파서 패키지를 물리지 않는다).
import { readFile, writeFile } from 'node:fs/promises'

// data.go.kr 표준데이터 CSV는 EUC-KR(CP949)로 내려오는 경우가 많고, 최근 파일은 UTF-8이다.
// 잘못 읽으면 역명이 전부 깨진 채로 조용히 진행되므로 여기서 확정한다.
function decodeBuffer(buf, filePathForError) {
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'utf-8 (BOM)' }
  }
  // BOM이 없으면 UTF-8로 엄격 디코딩을 시도하고, 실패하면 EUC-KR로 본다.
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return { text, encoding: 'utf-8' }
  } catch {
    // 무시하고 아래로
  }
  try {
    const text = new TextDecoder('euc-kr').decode(buf)
    return { text, encoding: 'euc-kr' }
  } catch (err) {
    throw new Error(
      `${filePathForError} 의 문자 인코딩을 판별하지 못했습니다 (utf-8/euc-kr 둘 다 실패). 원인: ${err.message}`,
    )
  }
}

// RFC 4180. 따옴표 안의 쉼표/줄바꿈/이중따옴표를 처리한다.
function parseCsvText(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue // CRLF 의 CR 은 버린다
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  // 마지막 줄에 개행이 없는 경우
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // 완전히 빈 줄은 버린다(파일 끝 개행 때문에 생기는 [''] 한 칸짜리 행)
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/**
 * CSV 파일을 읽어 { headers, rows, encoding } 를 돌려준다.
 * rows 는 헤더명을 키로 갖는 객체 배열이다. 값은 trim 한다.
 */
export async function readCsv(filePath) {
  const buf = await readFile(filePath)
  const { text, encoding } = decodeBuffer(buf, filePath)
  const table = parseCsvText(text)

  if (table.length === 0) throw new Error(`${filePath} 이 비어 있습니다.`)

  const headers = table[0].map((h) => h.replace(/^﻿/, '').trim())
  const rows = table.slice(1).map((cells) => {
    const obj = {}
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = (cells[c] ?? '').trim()
    }
    return obj
  })

  return { headers, rows, encoding }
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * 검수용 CSV를 쓴다.
 * UTF-8 BOM을 붙이는 이유: 이 파일은 사람이 Excel로 여는 검수 리포트다.
 * BOM이 없으면 Windows Excel이 CP949로 읽어 한글 역명이 전부 깨진다.
 */
export async function writeCsv(filePath, columns, rows) {
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvCell(row[col])).join(','))
  }
  await writeFile(filePath, `﻿${lines.join('\r\n')}\r\n`, 'utf-8')
}
