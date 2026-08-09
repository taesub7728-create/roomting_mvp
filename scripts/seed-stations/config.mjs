// 시드 스크립트 설정값. 임계값과 노선 정렬은 여기 한 곳에서만 바꾼다.
//
// 이 파일의 값은 migration_025_stations_lines.sql 의 "설계 의도"를 그대로 옮긴 것이다.
// 한쪽만 바꾸면 SQL 주석과 실제 동작이 어긋난다 - 반드시 같이 고친다.
import path from 'node:path'

export const scriptDir = import.meta.dirname
export const repoRoot = path.resolve(scriptDir, '..', '..')

// 원본 데이터를 두는 곳. data.go.kr에서 받은 CSV를 그대로 넣는다(가공하지 않는다).
// 저장소에 커밋하지 않는다(.gitignore) - 용량이 크고 재다운로드가 가능하다.
export const dataDir = path.join(scriptDir, 'data')

// 좌표->시군구 역변환 캐시. 같은 좌표를 두 번 묻지 않기 위한 것이며 지워도 무방하다.
export const cacheDir = path.join(scriptDir, '.cache')

// 검수 리포트 경로. migration_025:40 과 027:196 이 이 경로를 문서로 가리키고 있으므로
// 옮기려면 두 migration 주석도 함께 고쳐야 한다.
export const reportPath = path.join(scriptDir, 'merge_report.csv')
export const dryRunReportPath = path.join(scriptDir, 'merge_report.dryrun.csv')

// ========================================
// 입력 파일
//
// 파일명은 data.go.kr 다운로드 시점마다 달라서 고정하지 않는다.
// 아래 패턴으로 dataDir 안을 찾고, 0개거나 2개 이상이면 중단한다(조용히 아무거나 고르지 않는다).
// ========================================
export const sourceFiles = {
  railwayStandard: {
    // 전국도시철도역사정보표준데이터 (국가철도공단, data.go.kr/data/15013205)
    // 좌표 / 영문 / 한자 / 환승역 구분 / 환승 노선 목록의 1차 출처
    match: /도시철도.*역사.*정보.*\.csv$/i,
    hint: '전국도시철도역사정보표준데이터 (data.go.kr/data/15013205)',
  },
  seoulMetroI18n: {
    // 서울교통공사_역명 다국어 표기 (data.go.kr/data/15044232)
    // 1~8호선 ja/zh 의 1차 출처. 그 외 노선은 이 파일에 없다(결손은 null로 둔다).
    match: /역명.*(다국어|외국어).*\.csv$/i,
    hint: '서울교통공사_역명다국어표기 (data.go.kr/data/15044232)',
  },
  legalDongCode: {
    // 행정안전부 행정표준코드 법정동코드 전체자료 (code.go.kr)
    // districts 테이블(migration_024)의 유일한 source-of-truth.
    //
    // ★ Kakao coord2regioncode(lib/kakao.mjs)는 이 master 를 만들지 않는다.
    //   역 좌표의 district 판정과, 여기서 만든 master 와의 교차검증에만 쓴다.
    //   불일치가 나오면 Kakao 쪽을 신뢰해 master 를 고치지 않고 중단한다.
    //
    // 확장자를 txt|csv 둘 다 받는 이유: 이 자료는 배포 형식이 고정돼 있지 않다.
    // 실제 파일을 받기 전에 하나로 좁히면 findSourceFile 이 "0개"로 중단한다.
    match: /법정동코드.*\.(txt|csv)$/i,
    hint: '행정안전부 행정표준코드 법정동코드 전체자료 (code.go.kr, 검색어: "법정동코드 전체자료")',
  },
}

// ========================================
// 병합 임계값
// ========================================

// 025 설계 의도 (3): 좌표 거리 <= 1.5km 여야 자동 병합 후보가 된다.
// 김포공항/디지털미디어시티급 최장 환승통로를 담되 인접 역과 섞이지 않는 값.
// 시드 후 merge_report.csv 의 coord_spread_m 분포를 보고 조정한다.
export const COORD_MERGE_MAX_M = 1500

// ========================================
// 대상 지역
//
// 확장축 (1): 경기(41)/인천(28)을 열 때 sidoCodes 에 코드를 추가하고 bbox를 넓히면 끝이다.
// 스키마 변경도 병합 규칙 변경도 없다.
//
// bbox는 Kakao 호출 건수를 줄이기 위한 "싼 사전 필터"일 뿐이고,
// 최종 판정은 항상 역변환으로 받은 sido 코드가 한다. bbox가 넉넉해서 생기는 초과분은
// 역변환 후 걸러지므로 안전한 방향의 오차다.
// ========================================
export const regionFilter = {
  sidoCodes: ['11'], // 서울특별시
  bbox: { minLat: 37.38, maxLat: 37.73, minLng: 126.70, maxLng: 127.22 },
}

// ========================================
// 노선 표시 순서 (lines.display_order) — ★ 표시 전용
//
// [E] 이 표는 더 이상 대표 좌표를 고르지 않는다.
//   좌표 선택은 line-identity.mjs 의 coordinatePriority 가 담당한다.
//   두 책임이 붙어 있으면 나중에 표시 모델(1호선/공항철도 등 사용자-facing 노선명)을
//   손대는 순간, 이미 requests 에 백필된 좌표가 조용히 이동한다.
//
// 표시 노선 모델 자체가 아직 확정되지 않았으므로(원천 노선명 '경부선'을 고객에게
// 그대로 보여줄 수는 없다) 이 표는 현재 어디에서도 쓰이지 않는다.
// lines 테이블 시드 단계에서 다시 다룬다.
// ========================================
export const lineDisplayOrder = {
  '1호선': 1,
  '2호선': 2,
  '3호선': 3,
  '4호선': 4,
  '5호선': 5,
  '6호선': 6,
  '7호선': 7,
  '8호선': 8,
  '9호선': 9,
  경의중앙선: 20,
  수인분당선: 21,
  분당선: 21,
  신분당선: 22,
  경춘선: 23,
  경강선: 24,
  공항철도: 25,
  서해선: 26,
  우이신설선: 30,
  신림선: 31,
  김포골드라인: 32,
  의정부경전철: 34,
  인천1호선: 40,
  인천2호선: 41,
}

// ========================================
// Kakao coord2regioncode 호출 정책
//
// 시드 생성 1회성이다. 런타임에는 호출하지 않는다(TODO_PHASE2 "다음에 할 일" 1번).
// ========================================
export const kakao = {
  endpoint: 'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json',
  // 좌표 캐시 키 자릿수. 표준데이터 좌표가 6자리라 그대로 쓴다.
  coordPrecision: 6,
  // 연속 호출 사이 대기(ms). 쿼터 초과보다 느린 쪽이 낫다.
  delayMs: 60,
  maxRetries: 3,
  // 새 응답 N건마다 캐시를 디스크에 쓴다.
  // 실행이 중간에 끊겨도 그때까지 받은 응답을 잃지 않기 위한 값이다.
  autosaveEvery: 25,
}
