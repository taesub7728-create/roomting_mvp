// 병합 파이프라인용 정규화 — 규칙 본체는 여기 없다.
//
// ★ 2026-08-10 변경: 규칙 구현이 src/shared/stationSearch/normalizeStationQuery.js 로 옮겨졌다.
//   같은 규칙 표(전각 매핑, 가타카나 매핑, 접미사 정규식)를 두 파일에 복제해 두는 것 자체가
//   026:55-56 이 경고한 드리프트이기 때문이다. 이 파일은 재수출 + 자기검증만 한다.
//
// ★ 어느 계약을 쓰는지가 중요하다
//   여기서 재수출하는 normalizeStationQuery 는 **DB 동등 계약**
//   (normalizeStationQuerySqlParity)이다. migration_026 의 SQL 함수와 결과가 정확히 같다.
//
//   검색용 계약(NFKC 포함)은 이름이 다르다. 이 파일에서 재수출하지 않는다 —
//   병합 그룹핑에 NFKC 가 섞여 들어가는 사고를 막기 위해서다.
//
//   병합 그룹핑 키(canonical_key)는 현재 308 station master 를 만들어 낸 값이다.
//   여기에 NFKC 를 끼우면 재실행 시 병합 결과가 달라질 수 있으므로 동결한다.
//   (실측: 고유 입력 9,143건 중 두 계약이 갈리는 것은 91건이고 전부 한자/중국어 표기와
//    운영기관명이다. 한국어 역명은 0건 — 그래도 그 사실에 기대지 않는다.)
//
// ★ station_aliases.alias_normalized 는 이 함수로 굽지 않는다.
//   그쪽은 검색용 계약(src/shared/.../normalizeStationQuery)을 쓴다. 프론트 autocomplete 가
//   같은 파일을 import 하므로 저장값과 조회값이 같은 규칙을 통과한다.

export {
  normalizeStationQuerySqlParity as normalizeStationQuery,
  hangulChosung,
} from '../../../src/shared/stationSearch/normalizeStationQuery.js'

import {
  normalizeStationQuerySqlParity,
  hangulChosung as chosung,
} from '../../../src/shared/stationSearch/normalizeStationQuery.js'

// migration_026:201-222 의 확인 쿼리와 같은 벡터. 순서와 값을 임의로 바꾸지 않는다.
// SQL 쪽을 고치면 이 표도 같이 고쳐야 한다.
const NORMALIZE_VECTORS = [
  ['t01_ko_suffix', '강남역', '강남'],
  ['t02_no_suffix', '뚝섬유원지', '뚝섬유원지'],
  ['t03_long_ko', '디지털미디어시티', '디지털미디어시티'],
  ['t04_space_lower', 'Digital Media City', 'digitalmediacity'],
  ['t05_period', 'Hongik Univ.', 'hongikuniv'],
  ['t06_en_suffix', 'Hongdae Station', 'hongdae'],
  ['t07_ko_suffix2', '홍대입구역', '홍대입구'],
  ['t08_period2', 'Konkuk Univ.', 'konkukuniv'],
  ['t09_katakana', 'ホンデイック', 'ほんでいっく'],
  ['t10_kana_hanja_suffix', 'ホンデ入口駅', 'ほんで入口'],
  ['t11_chouon', 'ホンデー', 'ほんで'],
  ['t12_hanja_suffix', '弘大入口駅', '弘大入口'],
  ['t13_fullwidth', '２号線', '2号線'],
  ['t14_fullwidth2', '２호선', '2호선'],
  // t15/t16: 초성 문자(ㅎ = U+314E)는 한글 "음절"이 아니라 호환 자모다.
  // 정규화가 건드리면 사용자가 'ㅎㄷ'을 쳤을 때 kind='chosung' 별칭과 매칭되지 않는다.
  ['t15_chosung_passthru', 'ㅎㄷ', 'ㅎㄷ'],
  ['t16_chosung_passthru2', 'ㅎㄷㅇㄱ', 'ㅎㄷㅇㄱ'],
]

const CHOSUNG_VECTORS = [
  ['t17', '강남', 'ㄱㄴ'],
  ['t18', '홍대입구', 'ㅎㄷㅇㄱ'],
  ['t19', '뚝섬유원지', 'ㄸㅅㅇㅇㅈ'],
  ['t20', '디지털미디어시티', 'ㄷㅈㅌㅁㄷㅇㅅㅌ'],
  ['t21_non_hangul_passthru', 'Hongdae', 'Hongdae'],
]

// 파싱을 시작하기 전에 부른다. 정규화가 틀린 채로 그룹핑하면 병합 결과 전체를 못 믿는다.
export function assertNormalizerMatchesSql() {
  const failures = []
  for (const [name, input, expected] of NORMALIZE_VECTORS) {
    const actual = normalizeStationQuerySqlParity(input)
    if (actual !== expected) failures.push(`${name}: normalizeStationQuery(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, 기대값 ${JSON.stringify(expected)}`)
  }
  for (const [name, input, expected] of CHOSUNG_VECTORS) {
    const actual = chosung(input)
    if (actual !== expected) failures.push(`${name}: hangulChosung(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, 기대값 ${JSON.stringify(expected)}`)
  }
  if (failures.length > 0) {
    throw new Error(
      [
        '정규화 함수 포팅본이 migration_026 의 확인 벡터와 어긋납니다. 시드를 만들면 안 됩니다.',
        ...failures.map((f) => `  - ${f}`),
        '',
        'src/shared/stationSearch/normalizeStationQuery.js 와',
        'migration_026_station_mapping_search.sql 중 어느 쪽이 맞는지 먼저 정한 뒤',
        '양쪽을 같이 고치십시오. 한쪽만 고치면 검색이 조용히 깨집니다.',
      ].join('\n'),
    )
  }
  return NORMALIZE_VECTORS.length + CHOSUNG_VECTORS.length
}
