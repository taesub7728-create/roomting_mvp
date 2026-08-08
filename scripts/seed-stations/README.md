# seed-stations

역·노선 마스터(migration 024~026) 시드를 만들기 위한 준비 단계.

**이 스크립트는 DB에 아무것도 쓰지 않는다.** 공공데이터를 파싱해서 병합하고,
사람이 검수할 `merge_report.csv`를 내놓는 데서 끝난다.
시드 SQL 생성은 검수를 통과한 뒤의 별도 단계이며 **아직 구현되지 않았다.**

```
소스 CSV 2개  ──►  파싱  ──►  좌표→시군구 역변환(Kakao)  ──►  병합  ──►  merge_report.csv
                                                                          │
                                                        needs_review=true 만 사람이 본다
```

## 왜 병합이 필요한가

`stations`는 "물리적 역사"가 아니라 **"고객이 고르는 하나의 지점"** 단위다(025 설계 의도 1).
환승역은 노선 수와 무관하게 1행이고, 환승 관계는 `station_lines` 행이 2개 이상인 것으로 표현한다.

그런데 공공데이터의 한 행은 "한 역의 한 노선"이다. 홍대입구역은 2호선·공항철도·경의중앙선
3행으로 들어온다. 이걸 1행으로 합치는 것이 이 스크립트가 하는 일이다.

문제는 **합쳐도 되는 쌍과 안 되는 쌍이 이름만으로는 구분되지 않는다**는 점이다.
신촌역은 2호선(서울교통공사)과 경의중앙선(코레일) 두 개가 400m 거리에 따로 있고 공식 환승이
아니다. 그래서 규칙으로 가른다.

## 준비

### 1. 원본 데이터

`scripts/seed-stations/data/` 에 아래 두 CSV를 **가공하지 않고 그대로** 넣는다.
(이 폴더는 `.gitignore` 대상이다 — 용량이 크고 재다운로드가 가능하다.)

| 파일 | 출처 | 이 파일이 1차 출처인 값 |
| --- | --- | --- |
| 전국도시철도역사정보표준데이터 | [data.go.kr/data/15013205](https://www.data.go.kr/data/15013205/standard.do) | 좌표, `name_en`, `name_hanja`, 환승역 구분, 환승 노선 목록, 운영기관 |
| 서울교통공사_역명 다국어 표기 | [data.go.kr/data/15044232](https://www.data.go.kr/data/15044232/fileData.do) | `name_ja`, `name_zh` (1~8호선) |

파일명은 다운로드 시점마다 달라서 고정하지 않고 패턴으로 찾는다(`config.mjs`의 `sourceFiles`).
못 찾거나 후보가 둘 이상이면 **조용히 아무거나 고르지 않고 중단한다.**

인코딩(EUC-KR/UTF-8)은 자동 판별한다. 잘못 읽으면 역명이 전부 깨진 채로 진행되기 때문이다.

### 2. Kakao REST API 키

저장소 루트 `.env` 에 넣는다. **커밋하지 않는다.**

```
KAKAO_REST_API_KEY=발급받은_REST_키
```

- 지도용 JS 키(`VITE_KAKAO_MAP_API_KEY`)와 **다른 키**다. 둘 다 32자 hex라 눈으로는 구분되지
  않으므로, 잘못 넣으면 401/403으로 드러나게 해 두었다.
- **용도는 하나뿐이다**: 역 좌표 → 시군구 코드 역변환(`coord2regioncode`).
  `station_districts.is_primary` 판정 기준이 "역 대표 좌표가 속한 구"인데(026 설계 의도),
  공공데이터에는 시군구 **코드**가 없고 도로명주소는 텍스트라 `districts.code`와 조인할 수 없다.
- **시드 생성 1회성이다. 런타임에는 호출하지 않는다.** 앱 번들에 REST 키가 들어갈 일이 없고
  쿼터·장애가 서비스에 영향을 주지 않는다.
- 키가 없으면 **중단한다.** 없는 채로 진행하면 district가 전부 null이 되어 병합 그룹핑 키가
  무너지고, 그 리포트는 검수용으로 쓸 수 없기 때문이다.

## 실행

```bash
npm run seed:stations              # 정상 실행
npm run seed:stations -- --no-kakao # 키 없이 파싱/병합만 확인 (dry run)
npm run seed:stations:selftest     # 병합 규칙 자체 검증 (원본 데이터·키 불필요)
```

`--no-kakao`의 결과는 `merge_report.dryrun.csv`로 나간다. 파일명을 분리한 이유는
district가 미해결인 리포트를 진짜 검수 리포트로 착각하지 않게 하기 위해서다.

## 병합 규칙

그룹핑 키(= `canonical_key`)는 `normalize_station_query(name_ko)` + primary `district_code` 다.
이건 **병합 후보를 모으는 키일 뿐이고, 이것만으로 병합을 확정하지 않는다.**

같은 그룹 안의 두 역은 아래를 **전부** 충족해야 자동 병합된다(025 설계 의도 2):

| # | 조건 | 어디서 판정하나 |
| --- | --- | --- |
| 1 | 정규화 역명 일치 | 그룹핑으로 보장 |
| 2 | primary district 일치 | 그룹핑으로 보장 |
| 3 | 좌표 거리 ≤ `COORD_MERGE_MAX_M`(1.5km) | `merge.mjs` `evaluatePair` |
| 4 | 표준데이터의 환승역 구분 = `Y` (양쪽 다) | 〃 |
| 5 | 표준데이터의 환승 노선 목록에 상대 노선 포함 (양방향) | 〃 |

하나라도 불충족 → **자동 병합 금지.** 별개 역으로 분리 보존하고 `decision='hold'`로 리포트에 남긴다.

### 이름으로 예외 처리하지 않는다

신촌을 코드에서 특수 취급하는 분기는 없다. 위 (4)(5)에서 자연스럽게 걸려 `hold`로 떨어진다.
특정 역명을 하드코딩하면 규칙이 실제로 동작하는지 확인할 수 없게 되고, 같은 성질의 다른 역을 놓친다.
`selftest.mjs`의 **B3** 케이스가 이걸 지킨다 — 같은 신촌 픽스처에 환승 조건만 채우면 병합된다.

### 좌표는 평균을 쓰지 않는다

병합된 역의 좌표는 **`display_order`가 가장 낮은 노선의 값**을 그대로 쓴다.
평균점은 승강장이 먼 환승역에서 어떤 출입구도 아닌 지점이 되고, 재적재할 때마다 값이 흔들려
백필/라우팅 결과를 재현할 수 없게 만든다.

그래서 `config.mjs`의 `lineDisplayOrder`는 **표시 순서표가 아니라 좌표 선택 규칙**이다.
표에 없는 노선은 900번대로 밀리고(알려진 노선이 항상 우선) 실행 요약에 경고로 뜬다.
경고가 보이면 그 노선을 표에 넣고 다시 돌린다.

## merge_report.csv

열 구성은 `migration_025_stations_lines.sql:41-43`에 확정돼 있다. 임의로 늘리거나 줄이지 않는다.

`coord_spread_m` 내림차순 정렬이라 **의심스러운 것이 맨 위에 온다.**
`needs_review=true` 건만 사람이 본다.

| 열 | 뜻 |
| --- | --- |
| `canonical_key` | 정규화 역명 \| 시군구 코드 |
| `district` | `11410 서대문구` |
| `merged_line_count` / `merged_lines` | 이 행에 합쳐진 노선 (`display_order` 순) |
| `coord_spread_m` | 합쳐진 좌표들의 **최대 상호 거리**. 평균/중심 기준이 아니다 |
| `name_variants` | 원본에 있던 한글 표기 변형 전부. 버리지 않고 `kind='legacy'` 별칭 후보가 된다 |
| `official_transfer_flag` | `Y` / `N` / `mixed` |
| `transfer_line_match` | 규칙 (5) 판정. 단일 노선은 `n/a` |
| `decision` | `merge` / `single` / `hold` |
| `needs_review` | `true`인 것만 본다 |
| `review_reason` | 왜 안 붙었는지 (`2호선↔경의중앙선 401m: 환승역구분 Y 아님(...)`) |

`ja_missing` / `zh_missing`은 **검수 사유가 아니다.** 서울교통공사 노선 밖(공항철도·신분당선 등)은
다국어 파일에 원래 없다. 결손은 추측해서 채우지 않고 null로 두며, 폴백은 조회 시점 체인이 담당한다
(`ja: name_ja → name_hanja → name_en → name_ko`).

### 검수 결과를 어떻게 반영하나

`hold`가 틀렸다고 판단되면 **역명을 코드에 넣지 말고 규칙 쪽을 고친다.**
`config.mjs`의 `COORD_MERGE_MAX_M` 조정, `lineDisplayOrder` 보강, 또는
`merge.mjs`의 규칙 (5) 양방향 요구 완화 — 어느 쪽이든 025 주석에도 같은 판단을 남긴다.

## 정규화 함수 포팅

`lib/normalize.mjs`는 `migration_026`의 `normalize_station_query` / `hangul_chosung`을 JS로 옮긴 것이다.
그룹핑 키를 DB 접속 전에 만들어야 하기 때문이다.

**포팅본이 SQL과 어긋나면 병합 그룹이 조용히 틀어진다.** 그래서 026 주석의 확인 벡터 21건을
실행 시작 시(파싱 전에) 그대로 돌리고, 하나라도 어긋나면 중단한다.

⚠ `station_aliases.alias_normalized`를 굽는 것은 **이 포팅본이 아니라 DB 함수**여야 한다
(026:56). 시드 SQL은 `insert ... select normalize_station_query(alias)` 형태로 쓴다.

## 다음 단계 (이 스크립트 범위 밖)

1. `merge_report.csv` 검수 — `needs_review=true` 건
2. 024~027 적용 (026 적용 직후 정규화 확인 쿼리를 **먼저** 돌린다)
3. 시드 SQL 생성 · 적재 (SQL Editor = postgres 전용. 쓰기 정책이 없다)
4. `region_text` 백필 → `station_id` 채우기

자세한 순서와 판정 기준은 `TODO_PHASE2.md`의 「다음에 할 일」과 「지역 라우팅 검증 시나리오」에 있다.
