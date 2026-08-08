// migration_026_station_mapping_search.sql 의 normalize_station_query / hangul_chosung 를
// JS로 그대로 옮긴 것.
//
// ★ 왜 포팅했나
//   병합 그룹핑 키(canonical_key)를 만들려면 DB 접속 전에 정규화가 필요하다.
//   026:56 은 "시드 스크립트도 이 함수를 통해 값을 만든다"고 적고 있는데,
//   그건 station_aliases.alias_normalized 를 만드는 시드 SQL 단계 이야기다.
//   그 단계에서는 반드시 DB의 normalize_station_query() 를 호출해야 한다
//   (INSERT ... select normalize_station_query(alias)). 여기 포팅본으로 값을 굽지 않는다.
//
// ★ 포팅본이 SQL과 어긋나면 병합 그룹이 조용히 틀어진다.
//   그래서 026 주석에 있는 검증 벡터를 그대로 들고 와서 실행 시작 시 돌린다
//   (assertNormalizerMatchesSql). 하나라도 어긋나면 파싱 전에 중단한다.

// (1) 전각 영숫자 -> 반각
const FULLWIDTH_FROM =
  '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ'
const FULLWIDTH_TO =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// (2) 가타카나 -> 히라가나
const KATAKANA_FROM =
  'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ'
const KATAKANA_TO =
  'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ'

// (3) 장음 부호, 나카구로 제거
const DROP_CHARS = 'ー・'

// PostgreSQL translate(string, from, to) 재현.
// to 가 짧으면 대응 문자가 없는 글자는 제거된다 - DROP_CHARS 가 이 성질을 쓴다.
function translate(text, from, to) {
  const map = new Map()
  const fromChars = Array.from(from)
  const toChars = Array.from(to)
  for (let i = 0; i < fromChars.length; i += 1) {
    if (map.has(fromChars[i])) continue // PG는 from 의 첫 등장만 쓴다
    map.set(fromChars[i], i < toChars.length ? toChars[i] : '')
  }
  return Array.from(text)
    .map((ch) => (map.has(ch) ? map.get(ch) : ch))
    .join('')
}

// (5) 공백/구두점 제거.
//   POSIX [[:space:]] 를 그대로 맞춘다. JS의 \s 는 U+00A0 등 유니코드 공백까지 잡아서
//   SQL 쪽과 결과가 갈릴 수 있으므로 쓰지 않는다.
const PUNCT_RE = /[ \t\n\v\f\r'.,()·-]/g

// (6) 끝의 역 접미사 제거. 전역 치환이 아니라 끝 1회만이다(SQL에 'g' 플래그가 없다).
const SUFFIX_RE = /(역|station|駅|站)$/

export function normalizeStationQuery(text) {
  if (text === null || text === undefined) return null // SQL strict 함수와 동일
  let out = translate(String(text), FULLWIDTH_FROM, FULLWIDTH_TO)
  out = translate(out, KATAKANA_FROM, KATAKANA_TO)
  out = translate(out, DROP_CHARS, '')
  out = out.toLowerCase()
  out = out.replace(PUNCT_RE, '')
  out = out.replace(SUFFIX_RE, '')
  return out
}

const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'

export function hangulChosung(text) {
  if (text === null || text === undefined) return null
  return Array.from(String(text))
    .map((ch) => {
      const cp = ch.codePointAt(0)
      if (cp >= 44032 && cp <= 55203) {
        return CHOSUNG[Math.floor((cp - 44032) / 588)]
      }
      return ch
    })
    .join('')
}

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
    const actual = normalizeStationQuery(input)
    if (actual !== expected) failures.push(`${name}: normalizeStationQuery(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, 기대값 ${JSON.stringify(expected)}`)
  }
  for (const [name, input, expected] of CHOSUNG_VECTORS) {
    const actual = hangulChosung(input)
    if (actual !== expected) failures.push(`${name}: hangulChosung(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, 기대값 ${JSON.stringify(expected)}`)
  }
  if (failures.length > 0) {
    throw new Error(
      [
        '정규화 함수 포팅본이 migration_026 의 확인 벡터와 어긋납니다. 시드를 만들면 안 됩니다.',
        ...failures.map((f) => `  - ${f}`),
        '',
        'lib/normalize.mjs 와 migration_026_station_mapping_search.sql 중 어느 쪽이 맞는지 먼저 정한 뒤',
        '양쪽을 같이 고치십시오. 한쪽만 고치면 검색이 조용히 깨집니다.',
      ].join('\n'),
    )
  }
  return NORMALIZE_VECTORS.length + CHOSUNG_VECTORS.length
}
