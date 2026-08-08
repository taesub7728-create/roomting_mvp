// manual-overrides.mjs 항목의 구조 검증.
//
// ★ 이 파일은 판정하지 않는다. manual-overrides.mjs 에 적힌 값의 "형식"만 본다.
//   fingerprint 가 현재 데이터와 일치하는지(stale 판정)는 merge.mjs 의 책임이다.
//   여기서 통과해도 적용이 보장되지 않는다 - 그건 fingerprint 일치 여부가 정한다.

export const VERDICTS = Object.freeze(['CONFIRMED_MERGE', 'CONFIRMED_SPLIT', 'MIXED'])

const REVIEW_ID_RE = /^RV-[0-9a-f]{8}$/
const FINGERPRINT_RE = /^fp_[0-9a-f]{16}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {object[]} overrides
 * @returns {string[]} 실패 사유 전체. 빈 배열이면 통과.
 */
export function collectOverrideSchemaErrors(overrides) {
  const errors = []

  if (!Array.isArray(overrides)) {
    return ['manualOverrides 는 배열이어야 합니다.']
  }

  const seenReviewId = new Map()

  overrides.forEach((o, i) => {
    const tag = `[${i}] ${o?.reviewId ?? '(reviewId 없음)'} ${o?.candidateName ?? ''}`

    if (typeof o?.reviewId !== 'string' || !REVIEW_ID_RE.test(o.reviewId)) {
      errors.push(`${tag}: reviewId 형식이 아닙니다 (RV-xxxxxxxx, hex 8자리).`)
    } else {
      if (seenReviewId.has(o.reviewId)) {
        errors.push(`${tag}: reviewId 중복 - 같은 값이 [${seenReviewId.get(o.reviewId)}]에도 있습니다.`)
      }
      seenReviewId.set(o.reviewId, i)
    }

    if (typeof o?.candidateName !== 'string' || o.candidateName.trim() === '') {
      errors.push(`${tag}: candidateName 이 비어 있습니다 (사람이 읽기 위한 라벨이며 필수).`)
    }

    if (typeof o?.fingerprint !== 'string' || !FINGERPRINT_RE.test(o.fingerprint)) {
      errors.push(`${tag}: fingerprint 형식이 아닙니다 (fp_ + hex 16자리). groupFingerprint() 로 계산한 실제 값을 넣으십시오.`)
    }

    if (!VERDICTS.includes(o?.verdict)) {
      errors.push(`${tag}: verdict 가 ${VERDICTS.join('/')} 중 하나가 아닙니다.`)
    }

    if (typeof o?.note !== 'string' || o.note.trim().length <= 20) {
      errors.push(`${tag}: note 가 비었거나 너무 짧습니다(20자 초과 필요). 빈 근거로 등록할 수 없습니다.`)
    }

    if (typeof o?.decidedAt !== 'string' || !DATE_RE.test(o.decidedAt)) {
      errors.push(`${tag}: decidedAt 형식이 아닙니다 (YYYY-MM-DD).`)
    }

    if (o?.verdict === 'MIXED') {
      if (!Array.isArray(o.partition) || o.partition.length < 2) {
        errors.push(`${tag}: MIXED 는 partition(2개 이상의 sourceRowKey 배열)이 필요합니다.`)
      } else {
        const allKeys = []
        o.partition.forEach((group, gi) => {
          if (!Array.isArray(group) || group.length === 0 || group.some((k) => typeof k !== 'string' || k === '')) {
            errors.push(`${tag}: partition[${gi}] 이 비어 있거나 sourceRowKey 문자열 배열이 아닙니다.`)
            return
          }
          allKeys.push(...group)
        })
        const dupKeys = allKeys.filter((k, idx) => allKeys.indexOf(k) !== idx)
        if (dupKeys.length > 0) {
          errors.push(`${tag}: partition 안에서 sourceRowKey 가 중복됩니다: ${[...new Set(dupKeys)].join(', ')}`)
        }
      }
    } else if (o?.partition !== undefined) {
      errors.push(`${tag}: verdict=${o.verdict} 는 partition 필드를 가질 수 없습니다 (MIXED 전용).`)
    }
  })

  return errors
}

/** 통과하지 못하면 전체 사유를 모아 한 번에 중단한다. */
export function validateManualOverrides(overrides) {
  const errors = collectOverrideSchemaErrors(overrides)
  if (errors.length > 0) {
    throw new Error(
      [
        `manual-overrides.mjs 구조 검증 실패 ${errors.length}건 - 시드 준비를 진행할 수 없습니다.`,
        ...errors.map((e) => `  - ${e}`),
      ].join('\n'),
    )
  }
}
