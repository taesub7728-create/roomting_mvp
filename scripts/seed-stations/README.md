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

`scripts/seed-stations/data/` 에 아래 파일을 **가공하지 않고 그대로** 넣는다.
(이 폴더는 `.gitignore` 대상이다 — 용량이 크고 재다운로드가 가능하다.)

| 파일 | 출처 | 이 파일이 1차 출처인 값 |
| --- | --- | --- |
| 전국도시철도역사정보표준데이터 | [data.go.kr/data/15013205](https://www.data.go.kr/data/15013205/standard.do) | 좌표, `name_en`, `name_hanja`, 환승역 구분, 환승 노선 목록, 운영기관 |
| 서울교통공사_역명 다국어 표기 | [data.go.kr/data/15044232](https://www.data.go.kr/data/15044232/fileData.do) | `name_ja`, `name_zh` (1~8호선) |
| 법정동코드 전체자료 | [code.go.kr](https://www.code.go.kr) (검색어: `법정동코드 전체자료`) | `districts` 전체 (`code`, `sido_code`, `name_ko`) |

법정동코드 전체자료는 `districts` 시드에만 쓴다(`npm run seed:stations:generate-districts-sql`).
`npm run seed:stations` 에는 필요 없다.

파일명은 다운로드 시점마다 달라서 고정하지 않고 패턴으로 찾는다(`config.mjs`의 `sourceFiles`).
못 찾거나 후보가 둘 이상이면 **조용히 아무거나 고르지 않고 중단한다.**

인코딩(EUC-KR/UTF-8)은 자동 판별한다. 잘못 읽으면 역명이 전부 깨진 채로 진행되기 때문이다.
법정동코드 전체자료는 EUC-KR 고정이며(실측), U+FFFD가 나오면 파일이 바뀐 것으로 보고 중단한다.

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

npm run seed:stations:generate-sql            # lines/stations/station_lines seed SQL 생성
npm run seed:stations:generate-districts-sql  # districts/station_districts seed SQL 생성
```

두 생성기는 **SQL 파일을 만들기만 하고 실행하지 않는다.** DB에 연결하지 않는다.
산출물은 `output/` 이며 `.gitignore` 대상이다. 사람이 검토한 뒤 Supabase SQL Editor에서 실행한다.

DB 적용 순서는 아래 하나뿐이다(아래 「다음 단계」에 근거를 적었다):

```
024 → 025 → 026 → seed_stations.sql → seed_districts.sql → DB 검증 → 027
```

`seed_districts.sql`은 **026이 만드는 `station_districts` 테이블**과
**`stations` 308행**을 둘 다 전제한다. 그 SQL 자신이 guard로 검사한다
(대상 테이블이 비어 있지 않거나 `stations`가 308행이 아니면 즉시 실패).

### districts 계층 규칙

일반구가 있는 시는 **구만 남기고 상위 시 행을 뺀다**(성남시 제외 / 수정·중원·분당구 포함).
부동산 영업지역의 실제 단위가 구이고, 서울 자치구와 입도가 같아야
`realtor_service_areas` 가 한 가지 규칙으로 돌아가기 때문이다.

**★ 법정동코드의 숫자 패턴으로 이 계층을 추론하지 않는다.** `법정동명` 토큰 계층으로 판정한다
(`lib/district-hierarchy.mjs`). 코드 기반 규칙은 실데이터로 반증됐다 — `43740 영동군` 과
`43745 증평군` 은 앞 4자리를 공유하지만 부모-자식이 아니다. 폐기된 후보와 반례는 그 파일 주석에
남아 있고 selftest H5/H6가 회귀로 고정한다.

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

그런데 규칙 자체는 맞고(예: 신설동처럼 원본 데이터의 환승 정보가 실제로 결손된 경우), 사람이 실물을
확인해서 "이건 병합해도/분리해도 된다"고 확정한 건은 규칙을 건드리지 않고 `manual-overrides.mjs`
(아래)로 표시한다.

## manual override — 사람이 확정한 병합/분리 판정

`hold`로 남은 candidate group 중 **사람이 실물(지도/현장/공식 자료)로 확인해서 최종 판정을 내린 것**은
`manual-overrides.mjs`에 등록한다. **git 추적되는 source-of-truth**다(`data/`·`output/`·`.cache/`처럼
매번 재생성되는 산출물이 아니다).

이건 자동 알고리즘의 예외 규칙이 아니다. `evaluatePair()`/union-find(`merge.mjs`)의 자동 판정은
**항상 그대로 수행**되고, 그 결과가 나온 뒤에만 override 가 candidate group 단위로 최종 partition 을
덮어쓴다. 특정 역명으로 자동 규칙 자체를 바꾸는 코드는 여전히 금지다.

### 항목 구조

```js
{
  reviewId:      'RV-a91b0e49',   // candidate group 식별자. matching 은 이 값만 쓴다
  candidateName: '신촌',          // 사람이 읽기 위한 라벨. matching 에는 안 쓴다
  fingerprint:   'fp_b4f70...',   // 판정 시점 그룹 내용의 스냅샷 해시
  verdict:       'CONFIRMED_SPLIT', // CONFIRMED_MERGE | CONFIRMED_SPLIT | MIXED
  note:          '...',           // 근거. 20자 초과 필수
  decidedAt:     '2026-08-08',
}
```

- **CONFIRMED_MERGE**: 그룹의 모든 source row 를 하나의 station 으로 확정한다.
- **CONFIRMED_SPLIT**: "지금 자동 결과를 아무렇게나 유지"가 아니라, **판정 당시의 automatic
  partition을 그대로 최종 승인**한다는 뜻이다. `partition` 필드는 쓰지 않는다 - fingerprint 안에
  이미 그 automatic partition 서명이 들어 있어서, 나중에 partition 이 달라지면 자동으로 stale 이 된다.
- **MIXED**: 3개 이상 source row 중 일부만 합친다. `partition`(sourceRowKey 문자열 배열의 배열)이
  필수이고, 그룹의 모든 row 를 정확히 1번씩 덮어야 한다.

`fingerprint`는 **손으로 만들지 않는다.** `npm run seed:stations:inventory` 로 만든
`manual_review_inventory.csv`/`.md` 에 `review_id`와 나란히 실제 계산값이 나온다(`source_row_key` 열도
같이 나오므로 MIXED `partition` 은 거기서 그대로 옮겨 적는다). 임의로 지어 넣으면 안전장치가
무의미해진다.

### fingerprint 는 무엇을 지키나

`reviewId`는 `normalize(main_name)` 만의 해시라 그룹 구성이 바뀌어도 값이 그대로다("이 그룹이
무엇을 가리키는가"만 식별한다). `fingerprint`는 반대로 "그때 사람이 실제로 본 내용"의 스냅샷이다 -
각 source row 의 역명/노선/식별/환승 정보/좌표/구, 그리고 **그 시점의 automatic partition**까지
포함한다(`lib/fingerprint.mjs`). 아래 중 하나라도 바뀌면 fingerprint 도 반드시 바뀐다:

- source row 가 추가/삭제됨 (표준데이터 갱신)
- line identity / 환승 여부 / 환승 노선 / 좌표 / 시군구가 바뀜
- **자동 병합 로직(`evaluatePair`/union-find) 자체가 바뀌어 같은 입력에서도 automatic partition 이
  달라짐** - 입력 행은 그대로여도 override 가 "예전 자동 판정 기준"을 조용히 덮어쓰지 못하게 한다

### stale / unused — 둘 다 `npm run seed:stations` 를 실패시킨다

- **stale**: `reviewId`는 있는데 저장된 fingerprint 와 지금 계산한 fingerprint 가 다르다.
- **unused**: override 의 `reviewId` 가 이번 실행의 어떤 candidate group 에도 없다(대개 역명 표기가
  바뀌어 `reviewId` 자체가 달라진 경우다 - 그러면 그 역은 override 없이 **자동 판정으로 조용히
  시드에 들어간다.** 예: 김포공항이 갈린 채로 들어간다. 그래서 unused 도 hard fail 이다).

하나라도 있으면:

1. `output/override_audit.csv` 를 먼저 쓴다(무엇이 깨졌는지 보이게)
2. stale/unused 상세를 콘솔에 출력한다 (review_id / candidate_name / 저장 vs 현재 fingerprint)
3. **`merge_report.csv` 는 갱신하지 않는다** - 직전의 정상 검수 리포트가 그대로 남는다. "실패한
   이번 실행 결과"를 정상 리포트처럼 덮어써서 사람이 오인하게 만들지 않기 위해서다
4. `process.exitCode = 1` 로 끝난다

**`--ignore-stale` 같은 우회 옵션은 의도적으로 만들지 않았다.** 대신 재판정 경로가 항상 같다:

1. `npm run seed:stations:inventory` 로 inventory 를 다시 만든다
2. 콘솔/`override_audit.csv` 에 찍힌 review_id 들의 새 fingerprint 를
   `manual_review_inventory.csv`/`.md` 에서 확인한다
3. **그룹 구성이 왜 바뀌었는지 사람이 직접 재검토한다** (자동으로 승인하지 않는다 - stale 은 데이터가
   바뀌었다는 사실만 알려줄 뿐, 새 상태가 여전히 병합해도 되는 상태인지는 아무도 보장하지 않는다)
4. `manual-overrides.mjs` 의 `fingerprint`(필요하면 `reviewId`/`verdict`/`partition`도)를 갱신한다

### 리포트에서 override 는 어떻게 보이나

`merge_report.csv` 의 `REPORT_COLUMNS`는 `migration_025_stations_lines.sql:41-43`에 고정돼 있어
**늘리지 않는다**(기존 migration 파일도 수정하지 않는다). override 가 유효하게 적용된 행은 기존 열
안에서만 표시된다:

| 열 | override 적용 시 |
| --- | --- |
| `decision` | 기존 enum(`merge`/`single`/`hold`) 그대로. 새 값을 추가하지 않는다 |
| `needs_review` | `true` → `false` (사람이 이미 확인했다는 뜻) |
| `review_reason` | 기존 automatic 근거를 지우지 않고 앞에 `[OVERRIDE RV-xxxxxxxx VERDICT]` 를 붙인다 |

`note` 전문은 여기 복제하지 않는다 - 상세 근거는 `manual-overrides.mjs` 와
`output/override_audit.csv`(review_id/candidate_name/verdict/status/fingerprint 2종/
automatic·final cluster 수/note)에 남는다. `output/` 은 매 실행 재생성되는 산출물이라
`.gitignore` 대상이다.

## 정규화 함수 포팅

`lib/normalize.mjs`는 `migration_026`의 `normalize_station_query` / `hangul_chosung`을 JS로 옮긴 것이다.
그룹핑 키를 DB 접속 전에 만들어야 하기 때문이다.

**포팅본이 SQL과 어긋나면 병합 그룹이 조용히 틀어진다.** 그래서 026 주석의 확인 벡터 21건을
실행 시작 시(파싱 전에) 그대로 돌리고, 하나라도 어긋나면 중단한다.

⚠ `station_aliases.alias_normalized`를 굽는 것은 **이 포팅본이 아니라 DB 함수**여야 한다
(026:56). 시드 SQL은 `insert ... select normalize_station_query(alias)` 형태로 쓴다.

## 다음 단계 (이 스크립트 범위 밖)

1. `merge_report.csv` 검수 — `needs_review=true` 건
2. **DB 적용 순서 (2026-08-09 확정)**

   ```
   024 → 025 → 026 → seed_stations.sql → seed_districts.sql → DB 검증 → 027
   ```

   - **026을 seed 보다 먼저** 적용한다. 026은 스키마만 만들어서
     `districts`/`stations`에 행이 없어도 적용되고, 반대로 `seed_districts.sql`은
     026이 만드는 `station_districts` 테이블이 있어야 실행된다.
   - 026 적용 직후 정규화 확인 쿼리를 **먼저** 돌린다.
   - `seed_districts.sql`은 `stations` 308행을 전제한다(SQL 자신이 guard로 검사).
     그래서 `seed_stations.sql`이 반드시 앞선다.
   - 027은 `station_districts`에 행이 있어야 트리거가 의미를 갖는다(마지막).
   - 시드 SQL 적재는 SQL Editor(postgres) 전용이다 — 세 테이블 모두 쓰기 정책이 없다.
3. `region_text` 백필 → `station_id` 채우기

자세한 순서와 판정 기준은 `TODO_PHASE2.md`의 「다음에 할 일」과 「지역 라우팅 검증 시나리오」에 있다.
