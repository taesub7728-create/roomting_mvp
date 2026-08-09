// 법정동코드 -> districts(migration_024) 5자리 시군구 집합 도출 규칙. 순수 함수만 둔다.
//
// 이 파일은 파일 입출력을 하지 않는다. sources/legal-dong-code.mjs 가 파싱한
// { code, name, status } 배열을 받아 "어느 행이 district 인가"만 판정한다.
// 분리한 이유: 아래 [B] 반례를 원본 파일 없이 selftest 픽스처로 고정하기 위해서다.
// 파서에 묻으면 269/13/256 실데이터로만 확인할 수 있고 반례를 회귀 테스트로 남길 수 없다.
//
// ─────────────────────────────────────────────────────────────────
// [A] 1단계 - 시군구 레벨 행만 고른다
//
//   법정동코드 10자리 = 시도(2) + 시군구(3) + 읍면동(3) + 리(2)
//     뒤 5자리가 '00000'      -> 읍면동/리 행을 배제
//     3~5번째가 '000' 이 아님 -> 시도 행(1100000000 서울특별시)을 배제
//
//   이 조건만으로 024 의 제약 2개가 구조적으로 보장된다:
//     districts_code_format  code ~ '^[0-9]{5}$'   <- 10자리 숫자의 앞 5자리
//     districts_sido_prefix  left(code,2)=sido_code <- sido_code 를 code 에서 잘라 쓴다
//   그래도 생성기가 SQL 을 쓰기 직전에 두 조건을 다시 검사한다(이 저장소의 이중 방어 관례).
//
// ─────────────────────────────────────────────────────────────────
// [B] 2단계 - 일반구가 있는 시에서 "상위 시" 행을 뺀다
//
//   [결정 1, 2026-08-09] 부동산 영업지역의 실제 단위가 구다. 성남시 전체를 담당하는
//   중개사는 없고 분당구와 수정구는 다른 시장이다. 서울 자치구와 입도가 일치해야
//   realtor_service_areas 가 한 가지 규칙으로 돌아간다.
//     41130 성남시  -> 제외      41131 수정구 / 41133 중원구 / 41135 분당구 -> 포함
//
//   ★★ 법정동코드의 숫자 패턴으로 이 계층을 추론하지 않는다. 2026-08-09 실데이터 반증 ★★
//
//     후보 A  이름 token 계층          제외 13 -> 최종 256   <- 채택(이 파일)
//     후보 B  앞 4자리 + 끝자리 0      제외 14 -> 최종 255   <- 폐기
//     후보 C  앞 3자리 그룹            성립하지 않음          <- 폐기
//
//     B 의 반례:  43740 충청북도 영동군  /  43745 충청북도 증평군
//       앞 4자리 '4374' 를 공유하지만 부모-자식이 아니다. B 는 끝자리가 0 인 영동군을
//       상위 시로 오인해 제외한다 - 실재하는 군 하나가 통째로 사라진다.
//       (selftest H5 가 이 케이스를 고정한다. B 로 되돌리면 그 테스트가 깨진다.)
//
//     C 의 반례:  앞 3자리 '411' 그룹에 부모가 4개(수원 41110 / 성남 41130 /
//       안양 41170 / 부천 41190), '412' 에 2개(안산 41270 / 고양 41280) 들어간다.
//       그룹 자체가 성립하지 않는다.
//
//   "코드 기반이 더 단순하지 않나" 라는 재검토가 나오면 위 두 반례를 먼저 볼 것.
//   법정동코드의 숫자 패턴은 일반구 계층을 표현하도록 설계된 것이 아니다.
//
// ─────────────────────────────────────────────────────────────────
// [C] token hierarchy - 문자열 startsWith 를 쓰지 않는 이유
//
//   startsWith 는 "몇 단계 아래인지"를 구분하지 못하고 우연한 접두 일치를 걸러내지
//   못한다. 토큰 배열로 비교하고 child 토큰 수 = parent 토큰 수 + 1 을 강제해서
//   "바로 아래 한 단계"만 부모-자식으로 인정한다.
//     parent  "경기도 성남시"        -> ['경기도','성남시']
//     child   "경기도 성남시 분당구" -> ['경기도','성남시','분당구']
//
//   특정 도시명·코드 하드코딩은 없다. 판정 입력은 파일에서 온 토큰 배열뿐이다.

/** 시군구 레벨 코드인가. 10자리 원본 코드를 받는다. */
export function isDistrictLevelCode(code) {
  return /^[0-9]{10}$/.test(code) && code.slice(5) === '00000' && code.slice(2, 5) !== '000'
}

/**
 * [A] 1단계 후보. 현행('존재') 행 중 시군구 레벨만 남긴다.
 *
 * ★ 현행 필터를 계층 판정보다 먼저 적용한다. 부천 원미구는 현행 41192 와 폐지 41195 가
 *   이름이 같고 코드만 다르다 - 폐지 행이 섞인 채로 계층을 판정하면 같은 이름이 둘이 되어
 *   부모-자식 관계가 모호해진다.
 */
export function districtCandidates(rows) {
  return rows
    .filter((r) => r.status === '존재' && isDistrictLevelCode(r.code))
    .map((r) => {
      // ★ 토큰 분리 전에 trim 이 끝나 있어야 한다. 부천 3개 구(41192/41194/41196)는
      //   원본 법정동명 끝에 공백이 하나 붙어 있다(실측). 파서가 이미 trim 하지만
      //   여기서도 방어한다 - 이 함수는 픽스처로 직접 호출되기도 한다.
      const name = String(r.name).trim()
      return {
        code: r.code,
        code5: r.code.slice(0, 5),
        sidoCode: r.code.slice(0, 2),
        fullName: name,
        tokens: name.split(/\s+/),
        nameKo: name.split(/\s+/).at(-1),
      }
    })
}

/** child 가 parent 의 바로 아래 한 단계인가. [C] 참고. */
export function isDirectChild(parent, child) {
  if (parent === child) return false
  if (parent.sidoCode !== child.sidoCode) return false
  if (child.tokens.length !== parent.tokens.length + 1) return false
  for (let i = 0; i < parent.tokens.length; i += 1) {
    if (child.tokens[i] !== parent.tokens[i]) return false
  }
  return true
}

/**
 * [B] 2단계. 후보 집합에서 상위 시를 제거한 최종 district 목록을 만든다.
 *
 * @returns {{ districts, excludedParents, issues }}
 *   issues 가 비어 있지 않으면 호출부가 중단한다. 여기서 throw 하지 않는 이유는
 *   문제를 한 건만 보여주고 죽는 것보다 전부 모아서 보고하는 편이 낫기 때문이다.
 */
export function resolveDistrictHierarchy(candidates) {
  const issues = []

  const parentOf = new Map() // child.code5 -> parent[]
  const childrenOf = new Map() // parent.code5 -> child[]

  for (const p of candidates) {
    const kids = candidates.filter((c) => isDirectChild(p, c))
    if (kids.length === 0) continue
    childrenOf.set(p.code5, kids)
    for (const c of kids) {
      if (!parentOf.has(c.code5)) parentOf.set(c.code5, [])
      parentOf.get(c.code5).push(p)
    }
  }

  // 계층이 모호한 경우는 숫자를 맞추려 임의로 하나를 고르지 않고 중단 대상으로 올린다.
  for (const [childCode, parents] of parentOf) {
    if (parents.length > 1) {
      issues.push(
        `district ${childCode} 의 상위 후보가 ${parents.length}개다 ` +
        `(${parents.map((p) => `${p.code5} "${p.fullName}"`).join(' , ')}). 계층이 모호해 판정할 수 없다.`,
      )
    }
  }

  const excluded = new Set(childrenOf.keys())
  const districts = candidates.filter((c) => !excluded.has(c.code5))

  const seen = new Map()
  for (const d of districts) {
    if (seen.has(d.code5)) {
      issues.push(`5자리 code 중복: ${d.code5} ("${seen.get(d.code5).fullName}" / "${d.fullName}")`)
    }
    seen.set(d.code5, d)
  }

  const excludedParents = candidates
    .filter((c) => excluded.has(c.code5))
    .map((p) => ({ ...p, children: childrenOf.get(p.code5) }))

  return { districts, excludedParents, issues }
}
