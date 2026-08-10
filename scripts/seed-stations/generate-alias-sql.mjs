// station_aliases 시드 SQL 생성기.
//
// 실행:  npm run seed:stations:generate-alias-sql
// 출력:  scripts/seed-stations/output/seed_station_aliases.sql   (gitignore 대상)
//
// ★ 이 스크립트는 DB 에 쓰지 않는다. 읽기(GET)만 하고 SQL 파일을 만든다.
//   생성된 SQL 은 사람이 Supabase SQL Editor 에서 검토 후 실행한다.
//
// ============================================================================
// 입력
// ============================================================================
//   official : 현재 DB stations (id, name_ko, name_en, name_ja, name_zh)
//              ★ name_hanja 는 쓰지 않는다 - 아래 [범위] 참고
//   legacy   : tracked merge_report.csv 의 name_variants
//
//   파이프라인을 재실행하지 않는다. Kakao 를 호출하지 않는다.
//   시드 대상이 "현재 DB 의 308 역" 이므로 입력원도 그것이어야 정합적이다.
//
// ============================================================================
// 범위 (첫 시드)
// ============================================================================
//   생성:   official  name_ko(ko) / name_en(en) / name_ja(ja) / name_zh(zh)
//           chosung   hangulChosung(normalizeStationQuery(name_ko)), lang=ko
//           legacy    merge_report name_variants, lang=ko, 검수 제외 적용
//   미생성: name_hanja / short / 로마자 변형 / 번역 / 임의 관용명
//   source: 전부 'dataset'
//
//   ★ name_hanja 제외 사유
//     한국식 한자 역명이지 중국어 역명이 아니다. 중국 본토 사용자가 그 문자열을 입력한다고
//     전제할 수 없다. 게다가 CJK 호환 한자 / 공백 혼입 / 한글 혼입 등 정제가 필요한 값이 섞여
//     있다. 품질 정제 후 후속 증분 시드로 다룬다(unique index 가 중복을 막으므로 안전하다).
//     ★ 따라서 이 시드의 중국어 coverage 는 name_zh 98/308 = 31.8% 다.
//       한자를 합쳐 93.5% 라고 말하지 않는다 - 그건 다른 표기 체계다.
//
// ============================================================================
// 정규화
// ============================================================================
//   alias_normalized 는 src/shared/stationSearch/normalizeStationQuery.js 의
//   normalizeStationQuery (검색 계약) 로 만든다. 프론트 autocomplete 가 사용자 입력에
//   같은 파일을 import 하므로 저장값과 조회값이 같은 규칙을 통과한다.
//   ★ 생성기 전용 복사본을 만들지 않는다.
//
//   병합 그룹핑용 normalizeStationQuerySqlParity 계약과 혼동하지 말 것.
//   검색용 NFKC 가 station merge 결과에 침투하면 실패다.
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

import { scriptDir, repoRoot, reportPath } from './config.mjs'
import { legacyAliasExclusions } from './legacy-alias-exclusions.mjs'
import {
  normalizeStationQuery,
  hangulChosung,
} from '../../src/shared/stationSearch/normalizeStationQuery.js'

const outputDir = path.join(scriptDir, 'output')
const outPath = path.join(outputDir, 'seed_station_aliases.sql')

const ALIAS_SOURCE = 'dataset'

// ========================================
// contract - 맞추기 위한 분기를 넣지 않는다. 어긋나면 원인을 보고하고 중단한다.
// ========================================
const EXPECT = {
  stations: 308,
  reportRows: 308,
  candidates: 1392,
  dedupeRemoved: 28,
  aliases: 1364,
  byKind: { official: 936, chosung: 308, legacy: 120 },
  byLang: { ko: 736, en: 308, ja: 222, zh: 98 },
  uniqueNormalized: 1270,
  collisions: 51,
  exclusions: 2,
}

// dedupe 우선순위. 앞선 것이 이긴다.
// official 이 표시·검수 기준값이고, legacy 는 같은 정규화 값이면 정보를 더하지 않는다.
const PRIORITY = [
  ['official', 'ko'], ['official', 'en'], ['official', 'ja'], ['official', 'zh'],
  ['chosung', 'ko'], ['legacy', 'ko'],
]
const priorityOf = (kind, lang) => {
  const i = PRIORITY.findIndex(([k, l]) => k === kind && l === lang)
  return i === -1 ? PRIORITY.length : i
}

const VALID_KINDS = new Set(['official', 'chosung', 'romanization', 'short', 'legacy'])
const VALID_SOURCES = new Set(['dataset', 'manual-reviewed'])
const VALID_LANGS = new Set(['ko', 'en', 'ja', 'zh'])

// ----------------------------------------
function sqlText(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function sqlUuid(v) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v))) {
    fail([`station_id 가 uuid 형식이 아닙니다: ${JSON.stringify(v)}`])
  }
  return `'${v}'::uuid`
}
function fail(lines) {
  throw new Error(['', ...lines.map((l) => `  ${l}`), ''].join('\n'))
}

// ----------------------------------------
// .env 에서 Supabase 읽기 자격증명을 가져온다. anon key 만 쓰고 읽기만 한다.
function readEnv() {
  let text
  try {
    text = readFileSync(path.join(repoRoot, '.env'), 'utf-8')
  } catch {
    fail([
      '.env 를 읽지 못했습니다. 저장소 루트에 .env 가 필요합니다(.env.example 참고).',
      'VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 두 값을 씁니다(읽기 전용).',
    ])
  }
  const env = Object.fromEntries(
    text.split(/\r?\n/)
      .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    fail(['.env 에 VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 가 없습니다.'])
  }
  return env
}

async function fetchStations() {
  const env = readEnv()
  const select = 'id,name_ko,name_en,name_ja,name_zh'
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/stations?select=${encodeURIComponent(select)}&limit=2000`
  const res = await fetch(url, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) {
    fail([
      `stations 조회에 실패했습니다: ${res.status}`,
      (await res.text()).slice(0, 300),
      '',
      'anon 으로 stations 를 읽을 수 없다면 SQL Editor 조회 결과를 파일로 넘기는 방식으로 바꿔야 합니다.',
    ])
  }
  return res.json()
}

// ----------------------------------------
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1 } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\r') { /* CRLF */ }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

function loadVariants() {
  const raw = readFileSync(reportPath, 'utf-8').replace(/^﻿/, '')
  const rows = parseCsv(raw)
  const header = rows[0]
  const iName = header.indexOf('name_ko')
  const iVar = header.indexOf('name_variants')
  if (iName === -1 || iVar === -1) {
    fail([`merge_report.csv 에 name_ko / name_variants 열이 없습니다. 헤더: ${header.join(', ')}`])
  }
  const out = []
  for (const r of rows.slice(1)) {
    if (!r[0]) continue
    const nameKo = r[iName]
    const variants = (r[iVar] || '').split('|').map((s) => s.trim()).filter(Boolean)
    // name_variants 는 [name_ko, ...aliasCandidates] 형태다. name_ko 자신을 뺀다.
    out.push({ nameKo, variants: variants.filter((v) => v !== nameKo) })
  }
  return out
}

// ----------------------------------------
// DB <-> report join contract.
//
// ★ 여기서 요구하는 name_ko uniqueness 는 **생성기 입력의 정합성 계약**이지
//   DB 영구 schema 의 natural key 가 아니다. migration_025 는 stations.name_ko 에
//   unique 를 걸지 않는다. 그래서 SQL 쪽 매칭은 name_ko 가 아니라 station_id(uuid)로 한다.
//   이 검사는 "지금 이 순간 두 입력이 같은 308 역을 가리키는가" 만 본다.
function assertJoinContract(stations, reportRows) {
  const errors = []
  if (stations.length !== EXPECT.stations) {
    errors.push(`DB stations 가 ${stations.length} 건입니다. ${EXPECT.stations} 건이어야 합니다.`)
  }
  if (reportRows.length !== EXPECT.reportRows) {
    errors.push(`merge_report.csv 데이터 행이 ${reportRows.length} 건입니다. ${EXPECT.reportRows} 건이어야 합니다.`)
  }

  const dbNames = stations.map((s) => s.name_ko)
  const dbDup = dbNames.length - new Set(dbNames).size
  if (dbDup > 0) errors.push(`DB name_ko 중복이 ${dbDup} 건입니다. 이 생성기는 name_ko 로 두 입력을 조인합니다.`)

  const rpNames = reportRows.map((r) => r.nameKo)
  const rpDup = rpNames.length - new Set(rpNames).size
  if (rpDup > 0) errors.push(`merge_report name_ko 중복이 ${rpDup} 건입니다.`)

  const dbSet = new Set(dbNames)
  const rpSet = new Set(rpNames)
  const dbOnly = dbNames.filter((n) => !rpSet.has(n))
  const rpOnly = rpNames.filter((n) => !dbSet.has(n))
  if (dbOnly.length > 0) errors.push(`DB 에만 있는 name_ko ${dbOnly.length} 건: ${dbOnly.slice(0, 10).join(', ')}`)
  if (rpOnly.length > 0) errors.push(`merge_report 에만 있는 name_ko ${rpOnly.length} 건: ${rpOnly.slice(0, 10).join(', ')}`)

  if (errors.length > 0) {
    fail([
      'DB stations 와 merge_report.csv 가 같은 308 역을 가리키지 않습니다. SQL 을 만들지 않습니다.',
      ...errors,
      '',
      '둘 중 하나가 갱신되었는지 확인하십시오. merge_report.csv 는 git 추적 대상이라 diff 로 보입니다.',
    ])
  }
}

// ----------------------------------------
function buildCandidates(stations, variantsByName, exclusionHits) {
  const rows = []
  const add = (station, alias, lang, kind) => {
    if (alias === null || alias === undefined) return
    const text = String(alias).trim()
    // 빈 문자열 / 공백-only / '-'(한자 없음 플레이스홀더) 는 별칭이 아니다.
    if (!text || text === '-') return
    const normalized = normalizeStationQuery(text)
    if (!normalized) return
    rows.push({
      stationId: station.id,
      nameKo: station.name_ko,
      alias: text,
      aliasNormalized: normalized,
      lang,
      kind,
      source: ALIAS_SOURCE,
    })
  }

  const exclusionKey = (nameKo, alias) => `${nameKo} ${alias}`
  const exclusionIndex = new Map(
    legacyAliasExclusions.map((e) => [exclusionKey(e.stationNameKo, e.alias), e]),
  )

  for (const station of stations) {
    add(station, station.name_ko, 'ko', 'official')
    add(station, station.name_en, 'en', 'official')
    add(station, station.name_ja, 'ja', 'official')
    add(station, station.name_zh, 'zh', 'official')
    // ★ name_hanja 는 첫 시드에서 만들지 않는다(위 [범위] 참고).

    // 초성은 정규화 후의 이름에서 뽑는다.
    //   '신촌역' -> normalize -> '신촌' -> 'ㅅㅊ'
    // 그래야 초성 검색과 한글 검색이 같은 결과를 낸다(name_ko 가 '역'으로 끝나는 38개 역).
    add(station, hangulChosung(normalizeStationQuery(station.name_ko)), 'ko', 'chosung')

    for (const variant of (variantsByName.get(station.name_ko) || [])) {
      const key = exclusionKey(station.name_ko, variant)
      if (exclusionIndex.has(key)) {
        exclusionHits.set(key, (exclusionHits.get(key) || 0) + 1)
        continue
      }
      add(station, variant, 'ko', 'legacy')
    }
  }
  return rows
}

// ----------------------------------------
// dedupe. DB unique index 에 책임을 맡기지 않는다.
// key 는 station_aliases 의 unique index 와 같다: (station_id, alias_normalized, coalesce(lang,''))
function dedupe(candidates) {
  const sorted = [...candidates].sort((a, b) => {
    const p = priorityOf(a.kind, a.lang) - priorityOf(b.kind, b.lang)
    if (p !== 0) return p
    // 우선순위가 같으면 입력 순서를 유지해야 결정론적이다.
    return 0
  })
  const seen = new Map()
  const kept = []
  const removed = []
  for (const row of sorted) {
    const key = `${row.stationId}|${row.aliasNormalized}|${row.lang ?? ''}`
    const prev = seen.get(key)
    if (prev) { removed.push({ row, keptInstead: prev }); continue }
    seen.set(key, row)
    kept.push(row)
  }
  return { kept, removed }
}

// ----------------------------------------
function validate(kept, stations, exclusionHits, removed) {
  const errors = []
  const stationIds = new Set(stations.map((s) => s.id))

  const missingRef = kept.filter((r) => !stationIds.has(r.stationId))
  if (missingRef.length) errors.push(`station reference missing ${missingRef.length} 건`)

  const emptyAlias = kept.filter((r) => !r.alias || !r.alias.trim())
  if (emptyAlias.length) errors.push(`empty alias ${emptyAlias.length} 건`)

  const emptyNorm = kept.filter((r) => !r.aliasNormalized)
  if (emptyNorm.length) errors.push(`empty alias_normalized ${emptyNorm.length} 건`)

  const seen = new Set()
  let dup = 0
  for (const r of kept) {
    const key = `${r.stationId}|${r.aliasNormalized}|${r.lang ?? ''}`
    if (seen.has(key)) dup += 1
    seen.add(key)
  }
  if (dup > 0) errors.push(`duplicate unique tuple ${dup} 건 (dedupe 가 제 역할을 못했습니다)`)

  const badKind = kept.filter((r) => !VALID_KINDS.has(r.kind))
  if (badKind.length) errors.push(`invalid kind ${badKind.length} 건`)

  const badSource = kept.filter((r) => !VALID_SOURCES.has(r.source))
  if (badSource.length) errors.push(`invalid source ${badSource.length} 건`)

  const badLang = kept.filter((r) => r.lang !== null && r.lang !== undefined && !VALID_LANGS.has(r.lang))
  if (badLang.length) errors.push(`unsupported lang ${badLang.length} 건`)

  const covered = new Set(kept.map((r) => r.stationId))
  const orphan = stations.filter((s) => !covered.has(s.id))
  if (orphan.length) errors.push(`orphan station ${orphan.length} 건: ${orphan.slice(0, 10).map((s) => s.name_ko).join(', ')}`)

  // 검수 제외는 정확히 1건씩 매칭해야 한다. 0 / 2+ / unused 전부 중단.
  for (const e of legacyAliasExclusions) {
    const n = exclusionHits.get(`${e.stationNameKo} ${e.alias}`) || 0
    if (n !== 1) {
      errors.push(
        `reviewed exclusion 이 ${n} 건 매칭했습니다 (1 이어야 함): ${e.stationNameKo} / "${e.alias}". ` +
        'merge_report.csv 가 바뀌었는지 확인하십시오.',
      )
    }
  }
  if (legacyAliasExclusions.length !== EXPECT.exclusions) {
    errors.push(`reviewed exclusion 이 ${legacyAliasExclusions.length} 건입니다. ${EXPECT.exclusions} 건이어야 합니다.`)
  }

  // cardinality contract
  const byKind = kept.reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {})
  const byLang = kept.reduce((m, r) => ((m[r.lang ?? '(null)'] = (m[r.lang ?? '(null)'] || 0) + 1), m), {})
  if (kept.length !== EXPECT.aliases) errors.push(`final alias 가 ${kept.length} 건입니다. ${EXPECT.aliases} 건이어야 합니다.`)
  if (removed.length !== EXPECT.dedupeRemoved) errors.push(`dedupe 제거가 ${removed.length} 건입니다. ${EXPECT.dedupeRemoved} 건이어야 합니다.`)
  for (const [k, v] of Object.entries(EXPECT.byKind)) {
    if ((byKind[k] || 0) !== v) errors.push(`kind=${k} 가 ${byKind[k] || 0} 건입니다. ${v} 건이어야 합니다.`)
  }
  for (const [k, v] of Object.entries(EXPECT.byLang)) {
    if ((byLang[k] || 0) !== v) errors.push(`lang=${k} 가 ${byLang[k] || 0} 건입니다. ${v} 건이어야 합니다.`)
  }
  if (byKind.romanization || byKind.short) errors.push('romanization / short 는 이번 범위가 아닙니다.')
  if (byLang['(null)']) errors.push(`lang=null 이 ${byLang['(null)']} 건입니다. name_hanja 를 제외했으므로 0 이어야 합니다.`)

  return { errors, byKind, byLang }
}

// ----------------------------------------
function collisionReport(kept) {
  const byNorm = new Map()
  for (const r of kept) {
    if (!byNorm.has(r.aliasNormalized)) byNorm.set(r.aliasNormalized, new Set())
    byNorm.get(r.aliasNormalized).add(r.stationId)
  }
  const multi = [...byNorm.entries()].filter(([, ids]) => ids.size > 1)
  return { uniqueNormalized: byNorm.size, multi }
}

// ----------------------------------------
async function main() {
  console.log('station_aliases 시드 SQL 생성 (DB 에 쓰지 않습니다)\n')

  const stations = await fetchStations()
  const reportRows = loadVariants()
  console.log(`  DB stations       ${stations.length}`)
  console.log(`  merge_report 행   ${reportRows.length}`)

  assertJoinContract(stations, reportRows)
  console.log('  join contract     통과 (양쪽 여집합 0 / 중복 0)')

  const variantsByName = new Map(reportRows.map((r) => [r.nameKo, r.variants]))
  const exclusionHits = new Map()
  const candidates = buildCandidates(stations, variantsByName, exclusionHits)
  console.log(`\n  후보 (dedupe 전)  ${candidates.length}`)

  const { kept, removed } = dedupe(candidates)
  console.log(`  dedupe 제거       ${removed.length}`)
  console.log(`  최종 alias        ${kept.length}`)

  const { errors, byKind, byLang } = validate(kept, stations, exclusionHits, removed)
  const { uniqueNormalized, multi } = collisionReport(kept)

  console.log(`\n  kind  ${JSON.stringify(byKind)}`)
  console.log(`  lang  ${JSON.stringify(byLang)}`)
  console.log(`  고유 alias_normalized  ${uniqueNormalized}`)
  console.log(`  station coverage       ${new Set(kept.map((r) => r.stationId)).size} / ${stations.length}`)

  if (uniqueNormalized !== EXPECT.uniqueNormalized) {
    errors.push(`고유 alias_normalized 가 ${uniqueNormalized} 건입니다. ${EXPECT.uniqueNormalized} 건이어야 합니다.`)
  }
  if (multi.length !== EXPECT.collisions) {
    errors.push(`collision 이 ${multi.length} 건입니다. ${EXPECT.collisions} 건이어야 합니다.`)
  }

  if (errors.length > 0) {
    fail([
      'static validation 에 실패했습니다. SQL 을 만들지 않습니다.',
      ...errors,
      '',
      '숫자를 맞추는 분기를 넣지 말고 원인을 먼저 확인하십시오.',
    ])
  }

  // 정상 collision 은 hard fail 이 아니다. 리포트한다.
  const kindsOf = (n) => [...new Set(kept.filter((r) => r.aliasNormalized === n).map((r) => r.kind))].sort().join('+')
  const chosungOnly = multi.filter(([n]) => kindsOf(n) === 'chosung')
  console.log(`\n  정상 collision ${multi.length} 건 (chosung ${chosungOnly.length} / 이름 계열 ${multi.length - chosungOnly.length})`)
  console.log('  ※ 서로 다른 physical station 이 같은 정규화 값을 공유하는 것은 정상이다. 삭제하지 않는다.')
  for (const [n, ids] of multi.filter(([n2]) => kindsOf(n2) !== 'chosung')) {
    const names = [...ids].map((id) => stations.find((s) => s.id === id).name_ko)
    console.log(`    "${n}" x${ids.size}  ${names.join(' / ')}`)
  }

  const sql = buildSql(stations, kept, byKind, byLang, uniqueNormalized, multi.length)
  await mkdir(outputDir, { recursive: true })
  await writeFile(outPath, sql, 'utf-8')

  console.log(`\n  생성 완료: ${outPath}`)
  console.log(`  md5: ${createHash('md5').update(sql).digest('hex')}`)
  console.log('\n  ★ 이 파일은 아직 실행되지 않았습니다. 사람이 검토 후 SQL Editor 에서 실행합니다.')
}

// ----------------------------------------
function buildSql(stations, rows, byKind, byLang, uniqueNormalized, collisions) {
  const L = []
  const stationIndex = new Map(stations.map((s, i) => [s.id, i + 1]))

  L.push('-- station_aliases 시드')
  L.push('-- 생성: npm run seed:stations:generate-alias-sql  (scripts/seed-stations/generate-alias-sql.mjs)')
  L.push('-- 실행: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run')
  L.push('-- 전제: migration_026 까지 적용되어 있고 station_aliases 가 비어 있어야 한다.')
  L.push('--')
  L.push('-- ============================================================')
  L.push('-- 범위')
  L.push('-- ============================================================')
  L.push('--   official  name_ko(ko) / name_en(en) / name_ja(ja) / name_zh(zh)')
  L.push('--   chosung   hangulChosung(normalizeStationQuery(name_ko)), lang=ko')
  L.push('--   legacy    merge_report.csv name_variants, lang=ko, 검수 제외 2건 적용')
  L.push('--   source    전부 dataset')
  L.push('--')
  L.push('--   ★ name_hanja / short / 로마자 변형 / 번역 / 임의 관용명은 만들지 않았다.')
  L.push('--     name_hanja 는 한국식 한자 역명이지 중국어 역명이 아니다. 이 시드의 중국어')
  L.push('--     coverage 는 name_zh 98/308 = 31.8% 다. 한자를 합쳐 93.5% 라고 말하지 않는다.')
  L.push('--')
  L.push('-- ============================================================')
  L.push('-- 카디널리티 (생성 시점 실측)')
  L.push('-- ============================================================')
  L.push(`--   alias total            ${rows.length}`)
  L.push(`--   kind                   official ${byKind.official} / chosung ${byKind.chosung} / legacy ${byKind.legacy}`)
  L.push(`--   lang                   ko ${byLang.ko} / en ${byLang.en} / ja ${byLang.ja} / zh ${byLang.zh}`)
  L.push(`--   고유 alias_normalized  ${uniqueNormalized}`)
  L.push(`--   station coverage       ${new Set(rows.map((r) => r.stationId)).size} / ${stations.length}`)
  L.push(`--   정상 collision         ${collisions} (서로 다른 station 이 같은 정규화 값을 공유 - 정상이다)`)
  L.push('--')
  L.push('-- ============================================================')
  L.push('-- station_id 매칭 방식')
  L.push('-- ============================================================')
  L.push('--   생성 시점 DB 에서 읽은 stations.id (uuid) 를 그대로 박는다.')
  L.push('--   ★ name_ko 나 station_code 로 fallback lookup 하지 않는다. 대체 경로를 두지 않는다.')
  L.push('--     migration_025 는 name_ko 에 unique 를 걸지 않으므로 name_ko 는 영구 natural key 가')
  L.push('--     아니다. 지금 308 행에서 중복이 0 인 것은 생성기 입력의 정합성일 뿐이다.')
  L.push('--')
  L.push('--   아래 guard 가 (station_id, name_ko) 308 쌍이 생성 당시와 전부 일치하는지 검사한다.')
  L.push('--   DB 를 재구축했다면 이 UUID 는 무효다 - 생성기를 다시 돌려 새 파일을 만들 것.')
  L.push('')
  L.push('BEGIN;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push('-- guard 1: 빈 테이블에만 넣는다 (one-shot seed)')
  L.push('--   ON CONFLICT 를 정상 제어 흐름으로 쓰지 않는다. 예기치 않은 충돌은')
  L.push('--   조용히 넘기는 것보다 실패하는 편이 회귀 발견에 유리하다.')
  L.push('-- ------------------------------------------------------------')
  L.push('DO $guard_empty$')
  L.push('DECLARE')
  L.push('  v_existing bigint;')
  L.push('BEGIN')
  L.push('  SELECT count(*) INTO v_existing FROM station_aliases;')
  L.push('  IF v_existing <> 0 THEN')
  L.push("    RAISE EXCEPTION 'station_aliases 에 이미 % 건이 있습니다. 이 시드는 빈 테이블 전용입니다.', v_existing;")
  L.push('  END IF;')
  L.push('END')
  L.push('$guard_empty$;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push('-- guard 2: station UUID 대조')
  L.push('--   생성 당시 참조한 (station_id, name_ko) 308 쌍을 VALUES 로 만들어 stations 와')
  L.push('--   한 번에 조인 검사한다. 개별 SELECT 를 반복하지 않는다.')
  L.push('-- ------------------------------------------------------------')
  L.push('CREATE TEMP TABLE _seed_alias_station_ref (')
  L.push('  seed_no    integer primary key,')
  L.push('  station_id uuid not null,')
  L.push('  name_ko    text not null')
  L.push(') ON COMMIT DROP;')
  L.push('')
  L.push('INSERT INTO _seed_alias_station_ref (seed_no, station_id, name_ko) VALUES')
  L.push(
    stations
      .map((s, i) => `  (${i + 1}, ${sqlUuid(s.id)}, ${sqlText(s.name_ko)})`)
      .join(',\n') + ';',
  )
  L.push('')
  L.push('DO $guard_station$')
  L.push('DECLARE')
  L.push('  v_expected  bigint;')
  L.push('  v_existing  bigint;')
  L.push('  v_missing   bigint;')
  L.push('  v_dup       bigint;')
  L.push('  v_total     bigint;')
  L.push('BEGIN')
  L.push('  SELECT count(*) INTO v_expected FROM _seed_alias_station_ref;')
  L.push('  SELECT count(*) INTO v_total    FROM stations;')
  L.push('  SELECT count(*) INTO v_existing')
  L.push('    FROM _seed_alias_station_ref r')
  L.push('    JOIN stations s ON s.id = r.station_id AND s.name_ko = r.name_ko;')
  L.push('  SELECT count(*) INTO v_missing')
  L.push('    FROM _seed_alias_station_ref r')
  L.push('   WHERE NOT EXISTS (')
  L.push('     SELECT 1 FROM stations s WHERE s.id = r.station_id AND s.name_ko = r.name_ko');
  L.push('   );')
  L.push('  SELECT count(*) INTO v_dup FROM (')
  L.push('    SELECT station_id FROM _seed_alias_station_ref GROUP BY station_id HAVING count(*) > 1')
  L.push('  ) d;')
  L.push('')
  L.push(`  IF v_total <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'stations 가 % 건입니다. ${EXPECT.stations} 건이어야 합니다. 생성기를 다시 돌리십시오.', v_total;`)
  L.push('  END IF;')
  L.push(`  IF v_expected <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'seed reference 가 % 건입니다. ${EXPECT.stations} 건이어야 합니다.', v_expected;`)
  L.push('  END IF;')
  L.push('  IF v_missing > 0 THEN')
  L.push("    RAISE EXCEPTION '(station_id, name_ko) 가 일치하지 않는 seed reference 가 % 건입니다. DB 가 재구축되었을 수 있습니다 - 생성기를 다시 돌리십시오.', v_missing;")
  L.push('  END IF;')
  L.push(`  IF v_existing <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'matched station 이 % 건입니다. ${EXPECT.stations} 건이어야 합니다.', v_existing;`)
  L.push('  END IF;')
  L.push('  IF v_dup > 0 THEN')
  L.push("    RAISE EXCEPTION 'seed reference 에 중복 station_id 가 % 건 있습니다.', v_dup;")
  L.push('  END IF;')
  L.push('END')
  L.push('$guard_station$;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push('-- alias 적재')
  L.push('--   ON CONFLICT 절을 쓰지 않는다. unique index 는 마지막 방어선이며,')
  L.push('--   여기서 충돌이 나면 생성기의 dedupe 가 깨진 것이므로 실패해야 한다.')
  L.push('-- ------------------------------------------------------------')
  L.push('INSERT INTO station_aliases (station_id, alias, alias_normalized, lang, kind, source)')
  L.push('SELECT r.station_id, v.alias, v.alias_normalized, v.lang, v.kind, v.source')
  L.push('  FROM (VALUES')
  L.push(
    rows
      .map((r) => `    (${stationIndex.get(r.stationId)}, ${sqlText(r.alias)}, ${sqlText(r.aliasNormalized)}, ` +
        `${sqlText(r.lang)}, ${sqlText(r.kind)}, ${sqlText(r.source)})`)
      .join(',\n'),
  )
  L.push('  ) AS v(seed_no, alias, alias_normalized, lang, kind, source)')
  L.push('  JOIN _seed_alias_station_ref r ON r.seed_no = v.seed_no;')
  L.push('')
  L.push('-- ------------------------------------------------------------')
  L.push('-- guard 3: 적재 결과 (COMMIT 전)')
  L.push('-- ------------------------------------------------------------')
  L.push('DO $guard_result$')
  L.push('DECLARE')
  L.push('  v_total    bigint;')
  L.push('  v_stations bigint;')
  L.push('BEGIN')
  L.push('  SELECT count(*) INTO v_total FROM station_aliases;')
  L.push('  SELECT count(DISTINCT station_id) INTO v_stations FROM station_aliases;')
  L.push(`  IF v_total <> ${rows.length} THEN`)
  L.push(`    RAISE EXCEPTION 'station_aliases 가 % 건입니다. ${rows.length} 건이어야 합니다.', v_total;`)
  L.push('  END IF;')
  L.push(`  IF v_stations <> ${EXPECT.stations} THEN`)
  L.push(`    RAISE EXCEPTION 'alias 가 붙은 station 이 % 건입니다. ${EXPECT.stations} 건이어야 합니다.', v_stations;`)
  L.push('  END IF;')
  L.push('END')
  L.push('$guard_result$;')
  L.push('')
  L.push('COMMIT;')
  L.push('')
  L.push('-- ============================================================')
  L.push('-- verification query - read-only. COMMIT 이후 사람이 직접 실행한다.')
  L.push('-- ★ TEMP 테이블은 ON COMMIT DROP 이라 여기서 참조할 수 없다. 참조하지 않는다.')
  L.push('-- ============================================================')
  L.push('')
  L.push('-- 1. 총계 / kind / lang / source')
  L.push('select count(*)::int as alias_total from station_aliases;')
  L.push(`--   기대: ${rows.length}`)
  L.push('')
  L.push('select kind, count(*)::int from station_aliases group by kind order by kind;')
  L.push(`--   기대: chosung ${byKind.chosung} / legacy ${byKind.legacy} / official ${byKind.official}`)
  L.push('')
  L.push("select coalesce(lang, '(null)') as lang, count(*)::int from station_aliases group by 1 order by 1;")
  L.push(`--   기대: en ${byLang.en} / ja ${byLang.ja} / ko ${byLang.ko} / zh ${byLang.zh}   (null 은 0 이어야 한다)`)
  L.push('')
  L.push('select source, count(*)::int from station_aliases group by source order by source;')
  L.push(`--   기대: dataset ${rows.length}`)
  L.push('')
  L.push('-- 2. station coverage / orphan')
  L.push('select count(distinct station_id)::int as covered_stations from station_aliases;')
  L.push(`--   기대: ${EXPECT.stations}`)
  L.push('')
  L.push('select count(*)::int as orphan_stations')
  L.push('  from stations s')
  L.push(' where not exists (select 1 from station_aliases a where a.station_id = s.id);')
  L.push('--   기대: 0')
  L.push('')
  L.push('-- 3. unique tuple 중복 (unique index 가 막지만 명시적으로 확인한다)')
  L.push('select count(*)::int as duplicate_tuples from (')
  L.push("  select station_id, alias_normalized, coalesce(lang, '') as lang")
  L.push('    from station_aliases')
  L.push('   group by 1, 2, 3 having count(*) > 1')
  L.push(') d;')
  L.push('--   기대: 0')
  L.push('')
  L.push('-- 4. 정상 collision (서로 다른 station 이 같은 정규화 값을 공유) - 리포트일 뿐 오류가 아니다')
  L.push('select count(*)::int as collisions from (')
  L.push('  select alias_normalized from station_aliases')
  L.push('   group by alias_normalized having count(distinct station_id) > 1')
  L.push(') c;')
  L.push(`--   기대: ${collisions}   (chosung 계열이 대부분이다. 삭제하지 말 것)`)
  L.push('')
  L.push('-- 5. 신촌 두 station 이 모두 별칭을 가지고 있는지')
  L.push('select s.name_ko,')
  L.push('       (select array_agg(l.name_ko order by l.display_order)')
  L.push('          from station_lines sl join lines l on l.id = sl.line_id')
  L.push('         where sl.station_id = s.id) as lines,')
  L.push('       count(a.id)::int as alias_count,')
  L.push('       count(*) filter (where a.kind = \'chosung\')::int as chosung_count')
  L.push('  from stations s')
  L.push('  join station_aliases a on a.station_id = s.id')
  L.push(" where s.name_ko in ('신촌', '신촌역')")
  L.push(' group by s.id, s.name_ko')
  L.push(' order by s.name_ko;')
  L.push('--   기대: 신촌(2호선) 과 신촌역(경의중앙선) 각 6행, chosung 각 1행')
  L.push('--   두 역의 alias_normalized 는 여러 개가 겹친다(신촌 / sinchon / 新村 ...). 정상이다.')
  L.push('')
  L.push("-- 6. 표본: '홍대' prefix 로 실제 검색이 되는지")
  L.push('select a.alias_normalized, a.kind, a.lang, s.name_ko')
  L.push('  from station_aliases a join stations s on s.id = a.station_id')
  L.push(" where a.alias_normalized like '홍대%'")
  L.push(' order by a.alias_normalized, s.name_ko;')
  L.push('')

  return L.join('\n') + '\n'
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exitCode = 1
})
