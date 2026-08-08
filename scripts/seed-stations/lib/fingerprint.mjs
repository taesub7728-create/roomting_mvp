// candidate group(검수 대상) 의 "그때 본 내용" 스냅샷 해시.
//
// reviewId(lib/review-id.mjs) 는 이름만의 해시라 그룹 구성이 바뀌어도 안 바뀐다.
// fingerprint 는 반대다 - 그룹의 실제 내용이 조금이라도 달라지면 반드시 값이 바뀌어야 한다.
// manual-overrides.mjs 의 override 는 fingerprint 가 일치할 때만 적용된다(merge.mjs).
//
// ★ canonical serialize 원칙
//   - 배열/set은 전부 정렬 후 join 한다 (재실행 순서, transfer code 나열 순서에 안정적이어야 한다)
//   - 객체 property iteration 에 의존하지 않는다 - 필드는 고정된 순서의 배열로만 직렬화한다
//   - 좌표는 config.mjs 의 kakao.coordPrecision 자릿수로 고정한다(표준데이터 좌표 자릿수와 동일 -
//     같은 입력 CSV라면 재실행해도 같은 문자열이 나온다)
//
// ★ automatic partition signature 를 포함하는 이유
//   나중에 자동 병합 로직(evaluatePair/union-find) 자체가 바뀌어 같은 입력 행에서도 다른
//   partition 이 나오게 되면, 입력 행 내용이 그대로라도 fingerprint 가 바뀌어야 한다.
//   그래야 override 가 "예전 자동 판정 기준"을 그대로 덮어쓰는 사고를 막는다.

import { createHash } from 'node:crypto'
import { kakao } from '../config.mjs'

const COORD_PRECISION = kakao.coordPrecision

// 역명/코드 등 실데이터에 나타나지 않는 제어문자를 구분자로 쓴다 - 필드 값이 우연히
// 구분자와 같은 문자를 포함해 서로 다른 두 그룹이 같은 문자열로 뭉개지는 사고를 막는다.
const FIELD_SEP = String.fromCharCode(1) // 한 행 안에서 필드 사이
const ITEM_SEP = String.fromCharCode(2) // 행과 행, 쌍과 쌍 사이
const SECTION_SEP = String.fromCharCode(3) // rows / pairs / partition 섹션 사이

function fmtCoord(n) {
  return Number(n).toFixed(COORD_PRECISION)
}

function sortedUnique(arr) {
  return [...new Set(arr)].sort()
}

/** source row 하나를 고정 순서 필드 튜플 문자열로 만든다. */
export function canonicalRowLine(unit) {
  if (!unit.sourceRowKey) {
    throw new Error('canonicalRowLine: sourceRowKey 가 없는 unit 입니다. annotateIdentities() 를 먼저 돌리십시오.')
  }
  return [
    unit.sourceRowKey,
    unit.rawName ?? '',
    unit.mainName ?? '',
    unit.subName ?? '',
    unit.stationCode ?? '',
    unit.lineCode ?? '',
    unit.lineIdentity ?? '',
    unit.isTransfer === true ? 'T' : unit.isTransfer === false ? 'F' : '?',
    sortedUnique(unit.transferLineCodes ?? []).join(','),
    sortedUnique([...(unit.transferIdentities ?? [])]).join(','),
    fmtCoord(unit.lat),
    fmtCoord(unit.lng),
    unit.district?.districtCode ?? '',
  ].join(FIELD_SEP)
}

/** 자동 union-find 결과(클러스터별 unit 배열)를 정렬된 서명 문자열로 만든다. */
export function partitionSignature(clusterUnitArrays) {
  const clusters = clusterUnitArrays
    .map((units) => sortedUnique(units.map((u) => u.sourceRowKey)).join(','))
    .sort()
  return clusters.join(ITEM_SEP)
}

/** evaluatePair() 가 그룹 내 모든 쌍에 대해 낸 ok/fail 요약. pairResults: [{ aKey, bKey, ok }] */
export function pairResultsSignature(pairResults) {
  const lines = pairResults
    .map(({ aKey, bKey, ok }) => {
      const [x, y] = [aKey, bKey].sort()
      return `${x}${FIELD_SEP}${y}${FIELD_SEP}${ok ? 'OK' : 'FAIL'}`
    })
    .sort()
  return lines.join(ITEM_SEP)
}

/**
 * @param {object} args
 * @param {object[]} args.rows            candidate group 의 모든 source row(annotateIdentities 이후)
 * @param {object[][]} args.automaticClusters  evaluatePair/union-find 가 낸 자동 partition
 * @param {{aKey:string,bKey:string,ok:boolean}[]} args.pairResults  그룹 내 모든 쌍의 evaluatePair 결과
 * @returns {string} `fp_` 로 시작하는 16진 해시
 */
export function groupFingerprint({ rows, automaticClusters, pairResults }) {
  const rowLines = rows.map(canonicalRowLine).sort()
  const payload = [
    `rowCount=${rows.length}`,
    `rows:${rowLines.join(ITEM_SEP)}`,
    `pairs:${pairResultsSignature(pairResults)}`,
    `partition:${partitionSignature(automaticClusters)}`,
  ].join(SECTION_SEP)

  const digest = createHash('sha256').update(payload, 'utf-8').digest('hex')
  return `fp_${digest.slice(0, 16)}`
}
