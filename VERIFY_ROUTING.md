# 지역 라우팅 검증 절차 (R1~R10) — 2026-08-11

migration 029 적용 + 프론트 B 배포(`40db18d`) 이후, **030 적용 전**에 수행하는 검증이다.
이 문서는 실행 전에 작성됐다. 결과를 보고 기준을 고치지 않기 위해서다.

실행이 끝나면 결과를 `TODO_PHASE2.md`로 옮기고 이 파일은 지운다.

---

## 0. 이 시점의 전제 (사용자 preflight 통과분)

| 항목 | 상태 |
| --- | --- |
| 적용된 migration | 022~029 + 033. **030 미적용** |
| 제거 대상 정책 | `requests_select_own_or_realtor` 2행 존재 / `requests_select_own_or_admin` 0행 |
| 030 대상 함수 6개 | 존재 |
| P3 (영업지역 커버리지) | realtor 2 / covered 2 / **uncovered 0** |

**중개사는 지금 이미 029 RPC로만 요청서를 읽는다.** 030은 "테이블 직접 조회"라는 우회로를
닫는 것이지, 라우팅을 켜는 것이 아니다. 라우팅은 프론트 B 배포 시점에 이미 발효됐다.
따라서 R1~R5·R8~R10은 **지금 판정 가능**하다.

---

## 1. fixture — 왜 이 두 역인가

| | 역 | 노선 | 구 | 코드 | 담당 중개사 |
| --- | --- | --- | --- | --- | --- |
| **A** | `아현` | 2호선 | 서대문구 | `11410` | `aaa@naver.com` (베스트공인중개사사무소) |
| **B** | `강남` | 2호선 · 신분당선 | 강남구 | `11680` | `test2@naver.com` (대박공인중개사) |

### 시드 원천으로 사전 확인한 것 (DB 조회 아님)

`scripts/seed-stations/.cache/coord2regioncode.json` (station_districts를 만든 카카오
`coord2regioncode` 응답 캐시)에서 두 역의 마스터 좌표를 직접 조회했다:

```
아현  37.557407,126.956079  ->  11410 서울특별시 서대문구
강남  37.498050,127.027950  ->  11680 서울특별시 강남구
```

`scripts/seed-stations/output/seed_stations.sql`에서 확인한 것:

```
line 186  st_0004  '0222' '강남'  37.49805,127.02795   -> line_2 + sinbundang  (2개 노선)
line 526  st_0072  '0242' '아현'  37.557407,126.956079 -> line_2               (1개 노선)
```

**이것은 근거이지 확정이 아니다.** 권위는 DB의 `station_districts`다 → 3번 쿼리로 확정한다.

### 이름 충돌 사전 확인

마스터 308역 중 해당 문자열을 포함하는 `name_ko`:

| 입력 | 매칭되는 역 | 위험 |
| --- | --- | --- |
| `아현` | `아현` 1개뿐 | 없음 |
| `강남` | `강남`, `강남구청` 2개 | 낮음 — **둘 다 강남구(11680)**라 오선택해도 라우팅 결과는 같다. 그래도 `강남`을 고른다 |

### 신촌·신사를 쓰지 않는 이유 (사용자 결정, 재확인)

`신촌`(2호선, 서대문구)과 `신촌역`(경의중앙선, 서대문구)이 별개 행으로 공존하고,
자동완성에서 `신촌` 입력 시 두 개가 함께 뜬다. 어느 것을 골랐는지 화면만 보고 확신할 수
없어 fixture로 부적합하다. **이 판단은 유지한다.**

---

## 2. 요청서 생성 절차 (브라우저)

### 사용 계정

| 역할 | 계정 | id |
| --- | --- | --- |
| 고객 (요청서 2건 모두 작성) | `user@naver.com` | `4b20f04b-dc7c-4c75-b29e-9f97ce660d84` |

두 요청서를 같은 고객이 쓰는 것이 맞다. 라우팅 조건은 `district_code`만 보고 작성자를
보지 않으므로, 작성자를 나누면 변수만 늘어난다.

### ⚠ deadline — 결론부터: **라우팅 검증에 영향이 없다**

- `schema.sql:79` — `response_deadline timestamptz not null default (now() + interval '24 hours')`
- 그러나 **`status`를 `'expired'`로 바꾸는 트리거·cron·코드가 저장소 전체에 0건이다.**
  `expired`는 `request_status` enum에 값만 있고 아무도 쓰지 않는다.
- `list_open_requests_for_realtor()`는 `r.status = 'open'`만 본다. **`response_deadline`을
  전혀 참조하지 않는다**(029:167).

→ **24시간이 지나도 요청서는 중개사 목록에 계속 보인다.** deadline 연장 조작은 필요 없다.

다만 두 가지는 지킨다:

1. **요청서를 마감하지 말 것.** 고객 화면의 "응답 그만 받기"를 누르면 `status='closed'`가
   되어 RPC에서 즉시 사라진다. 이것만이 유일한 실질 위험이다.
2. **R8(고객 화면)은 24시간 안에 하는 편이 좋다.** `ResponseStatus.jsx:30`의 카운트다운이
   `response_deadline` 기준이라 24시간 뒤에는 "마감" 표시가 된다. 라우팅과 무관한 표시
   문제지만, 화면을 자연 상태로 보려면 오늘 안에 확인한다.

### 단계

`user@naver.com`으로 로그인 → `/request` → 6단계 마법사.

**요청서 A (아현)**

| 단계 | 입력 |
| --- | --- |
| 1. 지역 | 입력칸에 **`아현`** 타이핑 → 드롭다운에서 **`아현` / `2호선`** 항목 클릭 |
| 2. 거래조건 | 월세 / 보증금 `1000` / 월세 `50` |
| 3. 방타입 | `원룸` |
| 4. 입주조건 | 오늘 이후 아무 날짜 (예: 2026-09-01) |
| 5. 추가요청 | **`routing-verify-A-ahyeon`** 입력 |
| 6. 확인 | 지역이 `아현`인지 확인 후 제출 |

**요청서 B (강남)** — 같은 계정으로 `/request` 재진입

| 단계 | 입력 |
| --- | --- |
| 1. 지역 | 입력칸에 **`강남`** 타이핑 → 드롭다운 **첫 번째** `강남` / `2호선 · 신분당선` 클릭 (`강남구청` 아님) |
| 2. 거래조건 | 월세 / 보증금 `2000` / 월세 `80` |
| 3. 방타입 | `원룸` |
| 4. 입주조건 | 오늘 이후 아무 날짜 |
| 5. 추가요청 | **`routing-verify-B-gangnam`** 입력 |
| 6. 확인 | 지역이 `강남`인지 확인 후 제출 |

`extra_note`에 식별자를 넣는 이유: 029 RPC가 `region_text`를 반환하지 않으므로, 중개사
화면에서 두 요청서를 구분하는 가장 확실한 표식이 `extra_note`다(대시보드 카드에 그대로
노출된다). 금액을 다르게 준 것도 같은 이유의 이중 표식이다.

### ★ 절대 하면 안 되는 것 — 칩 클릭

지역 단계 하단의 역 이름 칩(`t.stationChips`)은 **텍스트만 채우고 `station_id`를 만들지
않는다**(`StationAutocomplete.jsx:108-112`). 칩만 누르면 "목록에서 골라주세요" 안내가
뜨고 다음으로 못 간다. 설령 통과하더라도 `station_id=null` → 트리거가 `district_code`를
NULL로 비움 → **두 중개사 모두에게 안 보이는** 요청서가 된다.

**반드시 드롭다운 항목을 직접 클릭한다.** 선택되면 입력칸 아래에 선택 완료 힌트가 뜬다.

두 번째 안전장치: 텍스트를 고른 뒤 입력칸을 한 글자라도 고치면 `station_id`가 즉시
지워진다(`handleInput`, 같은 파일 92-96행). 고른 뒤에는 입력칸을 건드리지 않는다.

---

## 2.5. 생성 **전** 확인 쿼리 (read-only) — ★ 1차 게이트

전부 `select`만 있고 write가 없다. Supabase SQL Editor에서 실행한다.

### Q0-A. fixture 확정 — 이것이 진짜 게이트다

1번의 캐시 근거는 시드 원천이고, **권위는 DB의 `station_districts`다.**
요청서를 만들기 전에 여기서 확정한다. 여기가 틀리면 요청서를 만들 이유가 없다.

```sql
-- [Q0-A] 아현 / 강남의 primary district, 활성 여부, 좌표, 노선
select
  s.id                as station_id,
  s.name_ko,
  s.is_active,
  sd.district_code,
  d.name_ko           as district_name,
  s.latitude,
  s.longitude,
  (select count(*) from station_districts x
    where x.station_id = s.id and x.is_primary)            as primary_count,
  (select string_agg(l.name_ko, ' · ' order by l.display_order)
     from station_lines sl join lines l on l.id = sl.line_id
    where sl.station_id = s.id)                            as line_names
from stations s
left join station_districts sd on sd.station_id = s.id and sd.is_primary
left join districts d on d.code = sd.district_code
where s.name_ko in ('아현', '강남')
order by s.name_ko;
```

> **등호 매칭만 쓴다.** `TODO_PHASE2.md` 30번(F1)이 기록한 함정이다 — 마스터에는 접미사
> 없는 `홍대입구`와 접미사 있는 `신촌역`이 섞여 있어서, `'…역'`을 붙이면 조용히 0행이
> 되거나 엉뚱한 역이 1행 잡힌다. `LIKE '%강남%'`도 안 된다(`강남`+`강남구청` 2행).
> **`아현`과 `강남`은 둘 다 접미사가 없다** — `seed_stations.sql`에서 확인함.

**기대 — 정확히 2행**

| name_ko | is_active | district_code | district_name | latitude | longitude | primary_count | line_names |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `강남` | `true` | `11680` | `강남구` | `37.49805` | `127.02795` | `1` | `2호선 · 신분당선` |
| `아현` | `true` | `11410` | `서대문구` | `37.557407` | `126.956079` | `1` | `2호선` |

`station_id` 두 값을 **적어둔다.** Q1에서 대조에 쓴다.

### ✅ Q0-A 실측 결과 (2026-08-11) — 통과

| name_ko | station_id | district_code | district_name | primary_count | line_names |
| --- | --- | --- | --- | --- | --- |
| `강남` | `606fc153-4444-4109-8a5f-60ca30271e54` | `11680` | 강남구 | 1 | 2호선 · 신분당선 |
| `아현` | `aa8e9f89-a8d4-4982-9157-dfc813debba6` | `11410` | 서대문구 | 1 | 2호선 |

좌표·`is_active` 전부 기대값 일치. **1번의 시드 캐시 근거와 DB 마스터가 일치함을 확인**
했으므로 fixture는 확정이다. Q1은 이 두 `station_id`와 대조한다.

**FAIL 판정**

| 증상 | 의미 | 조치 |
| --- | --- | --- |
| 2행이 아님 | 역명이 마스터와 다름 | 중단하고 보고 |
| `district_code`가 표와 다름 | 1번의 fixture 가정이 틀림 | **중단.** 요청서를 만들지 말 것 |
| `primary_count` ≠ 1 | primary 누락 또는 중복 — 마스터 결손 | 중단하고 보고 |
| `is_active = false` | 027 트리거가 `23503`으로 INSERT를 거부한다 | 중단 |
| 두 역의 `district_code`가 같음 | fixture가 대조군 역할을 못 함 | 중단 |

### Q0-B. 표식 문자열 선점 확인

```sql
-- [Q0-B] extra_note 표식이 이미 쓰이고 있지 않은지
select id, created_at, status, extra_note
from requests
where extra_note in ('routing-verify-A-ahyeon', 'routing-verify-B-gangnam');
```

**기대: 0행.** 1행이라도 있으면 Q1이 옛 행을 함께 집어 판정이 흐려진다. 그 경우 표식
문자열 끝에 `-2`를 붙이고 이후 모든 쿼리의 문자열을 함께 바꾼다.

### Q0-C. 중개사 매물 baseline

```sql
-- [Q0-C] 두 중개사의 현재 properties 보유 현황 (기준선 기록용)
select
  pr.nickname,
  count(p.id)                                          as property_rows,
  count(p.id) filter (where p.request_id is null)      as public_listings,
  count(p.id) filter (where p.request_id is not null)  as request_responses
from profiles pr
left join properties p on p.realtor_id = pr.id
where pr.role = 'realtor'
group by pr.nickname
order by pr.nickname;
```

**이것은 PASS/FAIL 게이트가 아니라 기준선이다.** 값을 적어두고, 검증이 끝난 뒤 다시 돌려
**숫자가 변하지 않았는지** 확인한다(검증 중 실수로 응답을 보내지 않았다는 증거).

참고 대조값 — `TODO_PHASE2.md` 1491/1520행 기준이며 실측으로 확인된 값은 아니다:
`베스트공인중개사사무소` = 공개 매물 1 + 응답 매물 1(`dz`, 요청서 `cc193972-…`),
`대박공인중개사` = 0.

### Q2. 영업지역 배정 (생성 전에 돌려도 된다)

```sql
-- [Q2] 영업지역 배정 스냅샷
select sa.realtor_id, p.nickname, sa.area_type, sa.district_code, d.name_ko
from realtor_service_areas sa
join profiles  p on p.id   = sa.realtor_id
join districts d on d.code = sa.district_code
order by p.nickname;
```

**기대: 2행.** `베스트공인중개사사무소`=`11410 서대문구`, `대박공인중개사`=`11680 강남구`,
`area_type`은 둘 다 `district`.

### ★ Q3를 생성 전에 돌릴 수 있는가 — 없다 (구조적으로)

Q3는 "새 요청서 2건에 이미 응답이 달려 있지 않은가"를 보는데, **생성 전에는 그 요청서가
존재하지 않으므로 항상 0행이다.** 통과하는 것이 아니라 물어볼 대상이 없는 것이다.
0행을 "안전 확인됨"으로 읽으면 실제로는 아무것도 검증하지 않은 채 넘어가게 된다.

`my_response_count > 0` 숨김이 R1/R3을 잘못 FAIL 시키는 경로는 **요청서 생성 이후**에만
생긴다(검증 중 실수로 응답 전송, 또는 다른 탭에서의 조작). 그래서 Q3는 **생성 직후 ·
R1 착수 직전**에 돌리는 것이 맞다 — 3번에 그대로 둔다.

생성 전에 이 위험을 줄이는 실질적 조치는 위 **Q0-C의 baseline 기록**이다. 나중에 숫자가
늘었으면 검증 중에 응답이 생겼다는 뜻이고, 그것이 R1/R3 FAIL의 원인인지 바로 판별된다.

---

## 3. 생성 직후 확인 쿼리 (read-only) — ★ 2차 게이트

**이 쿼리가 통과하기 전에는 R1~R10을 시작하지 않는다.** `district_code`가 기대와 다르면
그 뒤의 모든 판정이 무의미하다.

Supabase SQL Editor에서 실행. `select`만 있고 write가 없다.

```sql
-- [Q1] 새 요청서 2건의 파생 경로 확인: station_id -> 027 트리거 -> district_code
select
  r.id,
  r.created_at,
  r.status,
  r.region_text,
  r.extra_note,
  r.location_type,
  r.station_id,
  s.name_ko                as station_name,
  r.district_code,
  d.name_ko                as district_name,
  r.location_lat,
  r.location_lng,
  r.response_deadline
from requests r
left join stations  s on s.id   = r.station_id
left join districts d on d.code = r.district_code
where r.extra_note in ('routing-verify-A-ahyeon', 'routing-verify-B-gangnam')
order by r.created_at;
```

**기대 결과 — 2행, 아래와 정확히 일치해야 한다**

| extra_note | station_name | district_code | district_name | location_lat | location_lng | status |
| --- | --- | --- | --- | --- | --- | --- |
| `routing-verify-A-ahyeon` | `아현` | `11410` | `서대문구` | `37.557407` | `126.956079` | `open` |
| `routing-verify-B-gangnam` | `강남` | `11680` | `강남구` | `37.49805` | `127.02795` | `open` |

`location_type`은 둘 다 `station`, `station_id`는 둘 다 NOT NULL.

**FAIL 판정과 원인**

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| 2행 미만 | 요청서가 저장되지 않음 | 제출 단계 재확인 |
| `station_id`가 NULL | 드롭다운을 안 고름 / 고른 뒤 입력칸 수정 | 해당 요청서 폐기하고 재작성 |
| `district_code`가 NULL인데 `station_id`는 있음 | `station_districts`에 primary 행 부재 — **마스터 결손이므로 보고** | 중단 |
| A와 B의 `district_code`가 같음 | 역을 잘못 고름(예: 둘 다 강남권) | 재작성 |
| `district_code`가 `11410`/`11680`이 아님 | fixture 가정이 틀림 — **1번의 캐시 근거와 대조해 보고** | 중단 |

`station_id` 두 값이 **Q0-A에서 적어둔 값과 일치**해야 한다. 다르면 다른 역을 고른 것이다.

Q2(영업지역)는 2.5절에서 이미 돌렸다. 요청서 생성 사이에 admin 조작이 없었다면 다시
돌릴 필요 없다.

```sql
-- [Q3] 두 중개사가 이 요청서들에 이미 응답한 적이 없는지 (R1/R3의 전제)
select p.request_id, p.realtor_id, pr.nickname, p.title
from properties p
join profiles pr on pr.id = p.realtor_id
where p.request_id in (
  select id from requests
  where extra_note in ('routing-verify-A-ahyeon', 'routing-verify-B-gangnam')
);
```

기대: **0행**. `RealtorDashboard.jsx:132`가 `my_response_count > 0`인 요청서를 목록에서
숨기므로, 응답 이력이 있으면 R1/R3이 "안 보임"으로 잘못 FAIL 난다.

---

## 4. 판정표 R1~R10

**공통 준비**: 브라우저 프로필/시크릿 창을 분리해 세션이 섞이지 않게 한다.
각 계정 로그인 후 `/realtor` 접속.

### 양성 대조 — "보여야 할 것이 보인다"

| # | 확인 대상 | 계정 / 화면 | PASS | FAIL |
| --- | --- | --- | --- | --- |
| **R1** | 자기 영업지역 요청서가 목록에 뜨는가 | `aaa` / `/realtor` → **받을 수 있는 요청** 탭 | 카드에 `아현 · 2호선` + 메모 `routing-verify-A-ahyeon` 표시 | 목록에 없음 |
| **R3** | 〃 (반대 중개사) | `test2` / 같은 화면 | 카드에 `강남 · 2호선 · 신분당선` + 메모 `routing-verify-B-gangnam` 표시 | 목록에 없음 |

### ★ 음성 대조 — "안 보여야 할 것이 안 보인다" (이 검증의 핵심)

R1·R3만 통과하는 것은 "전부 보이던" 이전 상태와 **구분되지 않는다.**
아래 4개가 실제로 라우팅이 작동하는지를 결정한다.

| # | 확인 대상 | 계정 / 화면 | PASS | FAIL |
| --- | --- | --- | --- | --- |
| **R2** | 남의 구 요청서가 목록에서 빠지는가 | `aaa` / **받을 수 있는 요청** 탭 | `강남` 카드 **없음**. 검색창에 `강남` 입력해도 0건, `routing-verify-B` 문자열 화면 전체에 부재 | `강남` 카드가 보임 |
| **R4** | 〃 (반대 방향) | `test2` / 같은 화면 | `아현` 카드 **없음**. 검색창에 `아현` 입력해도 0건 | `아현` 카드가 보임 |
| **R5** | 목록에서 감춘 것과 접근 차단이 다른가 | `test2` / 주소창에 `/realtor/respond/<A의 id>` 직접 입력 | **"이 요청서에 접근할 수 없어요…"** 에러 화면. 응답 폼(제목/보증금/월세 입력칸)이 **렌더되지 않음** | 응답 폼이 뜸 |
| **R5b** | R5의 대칭 | `aaa` / `/realtor/respond/<B의 id>` 직접 입력 | 동일한 에러 화면 | 응답 폼이 뜸 |

> **R2/R4에서 검색창을 함께 쓰는 이유**: 카드 목록이 길어지면 눈으로 훑어 "없다"고
> 판단하기 어렵다. 검색 필터(`stationSearchText`)는 역명·노선명·구 이름을 모두 훑으므로,
> `강남` 입력 후 0건이면 반환 데이터 자체에 없다는 뜻이다. 화면 스크롤 누락과 구분된다.

> **R5/R5b가 UI 에러 화면으로 판정되는 근거**: `RealtorRespond.jsx:54-57`이
> `get_open_request_for_realtor()` 결과가 null이면 `loadError`를 세팅하고, 89-96행에서
> **폼을 렌더하기 전에 early return** 한다. 029 함수에는 `RAISE`가 없어 조건 불일치가
> 예외가 아니라 0행으로 오고, 그 0행을 프론트가 "권한 없음"으로 해석한 결과다.

### 데이터 계약 / 권한

| # | 확인 대상 | 방법 | PASS | FAIL |
| --- | --- | --- | --- | --- |
| **R10** | 029의 컬럼 allowlist가 실제로 지켜지는가 (029 T4) | `aaa` 세션에서 `/realtor` 로드 → DevTools **Network** 탭 → `rpc/list_open_requests_for_realtor` 요청의 **Response** 확인 | 각 원소의 **키 자체가 없음**: `customer_id`, `created_by`, `status`, `response_deadline`, `station_id`, `district_code`, `location_lat`, `location_lng`, `jeonse_loan_detail`, `region_text` — 10종 전부 | 키가 하나라도 존재 (값이 `null`이어도 **FAIL**) |
| **R9** | 고객 세션이 중개사 RPC를 호출하면 (029 T9) | `user@naver.com` 세션에서 콘솔 스니펫(아래) | `[]` (빈 배열). 에러가 아니라 0행 | 요청서가 반환됨 |
| **R8** | 고객 화면 회귀 (023/029 이후 정상) | `user@naver.com` / `/mypage` → 요청서 목록 → 요청서 A 상세 | 요청서 A·B가 목록에 보이고 상세 진입 가능. 기존 요청서 `cc193972-…`의 응답 카드에 `베스트공인중개사사무소` 표시 + 채팅 정상 | 목록 누락 / 부동산 이름 부재 / 채팅 오류 |

**R10이 값이 아니라 키를 보는 이유**: 029의 `returns table(...)`이 컬럼 allowlist다.
값이 `null`인 것은 "데이터가 비었다"이고, 키가 없는 것은 "서버가 애초에 주지 않는다"다.
후자만이 개인정보 차단의 증거다. 값 기준으로 판정하면, 나중에 `customer_id`가 실수로
반환 목록에 추가돼도 그 컬럼이 우연히 비어 있는 순간에는 PASS로 보인다.

**R9 콘솔 스니펫** — `user@naver.com`으로 로그인한 탭의 DevTools 콘솔에 붙여넣는다.
`ANON_KEY`는 `.env`의 `VITE_SUPABASE_ANON_KEY` 값을 넣는다(공개 키라 노출 문제 없음).

```js
// R9: 고객 세션 -> 중개사 전용 RPC
const ANON_KEY = '여기에 VITE_SUPABASE_ANON_KEY 붙여넣기'
const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'))
const sess = JSON.parse(localStorage.getItem(k))
const ref = k.slice(3, -('-auth-token'.length))
const res = await fetch(`https://${ref}.supabase.co/rest/v1/rpc/list_open_requests_for_realtor`, {
  method: 'POST',
  headers: {
    apikey: ANON_KEY,
    Authorization: `Bearer ${sess.access_token}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
})
console.log(res.status, await res.json())   // 기대: 200 []
```

`200 []`이면 PASS. `current_user_role() = 'realtor'` 조건에서 걸러진 결과이고, 에러가
아니라 빈 배열인 것이 정상이다(029 함수에 `RAISE` 0건).

---

## 5. 030 적용 이후에만 판정 가능한 항목

### R6 — 영업지역 밖 요청서에 매물 INSERT 거부

| 항목 | 내용 |
| --- | --- |
| 확인 대상 | 030의 `properties_insert_realtor` 정책이 `request_id`의 `district_code`를 실제로 검사하는가 |
| 계정 | `test2` (강남구) → 요청서 A(아현, 서대문구)에 INSERT 시도 |
| PASS | RLS 거부 (`42501` / new row violates row-level security policy) |
| FAIL | INSERT 성공 |

**🚫 030 적용 전에 시도하지 말 것.** 현재 정책은 `realtor_id = auth.uid() and
current_user_role() = 'realtor'`뿐이라 **영업지역을 전혀 검사하지 않는다**(030:236 롤백
주석이 현재 정책 원문이다). 지금 시도하면 **INSERT가 성공하고**, 잘못된 `properties` 행과
후속 `chat_rooms`가 생겨 정리 대상이 된다. 030이 닫으려는 구멍이 바로 이것이다.

**UI로는 판정할 수 없다.** R5에서 확인했듯 `RealtorRespond`가 폼 렌더 전에 early return
하므로 제출 버튼에 도달하지 못한다. 030 적용 후 API 레이어에서 직접 호출해야 한다
(스니펫은 030 적용 시점에 작성한다).

### T1 / T2 — requests 테이블 직접 조회 0행

중개사 세션에서 `from('requests').select('*')` → 0행. 현재는
`requests_select_own_or_realtor`가 살아 있어 **전국이 그대로 나온다**. 030이 그 정책을
제거해야 성립한다. 030 적용 직후 확인 항목.

---

## 6. 지금 계정 구성으로는 판정 불가한 항목

### R7 — 영업지역이 없는 중개사가 0행을 보는가

**미검증 — 대상 부재. (a) 보류로 확정 (2026-08-11 사용자 결정)**

preflight P3가 `realtor 2 / covered 2 / uncovered 0`을 확인했다 — 영업지역 없는 중개사가
존재하지 않아 R7을 돌릴 대상이 없다.

**`realtor_service_areas`를 임시로 DELETE하지 않는다.** 검증 하나를 위해 운영 데이터를
지웠다 되돌리는 것은, 복구 실패 시 R3/R4까지 무효가 되고 CLAUDE.md 11번 승인 대상이
되면서 얻는 것보다 잃는 것이 크다.

R2/R4가 R7과 **같은 `exists(...)` 절**(029:169-174)을 탄다 — R7은 서브쿼리가 0행이라,
R2/R4는 매칭 실패라 걸러진다. SQL 실행 경로는 동일하다. **다만 R2/R4가 R7을 대체한다고
적지 않는다.** "영업지역 미배정 중개사"라는 운영 상황 자체는 검증되지 않은 채 남는다.

→ **후속: 2026년 11월 신규 중개사 승인 플로우 검증 시 함께 확인한다.**
신규 pending 계정을 승인하면 `approve_realtor_application()` 호출 **직전**에 자연스럽게
"role=realtor인데 영업지역 0행" 상태가 발생한다. 그 순간에 `list_open_requests_for_realtor()`를
한 번 호출하면 DB write 없이 R7이 판정된다. `TODO_PHASE2.md` 49번에 기록했다.

---

## 6.5. 실행 결과 (2026-08-11) — 030 전 검증 전부 통과

| # | 결과 | 실측 |
| --- | --- | --- |
| Q0-A | ✅ | 강남 `606fc153-…` / 11680, 아현 `aa8e9f89-…` / 11410, primary 각 1, 좌표·`is_active` 일치 |
| Q0-B | ✅ | 0행 (표식 미선점) |
| Q0-C | ✅ | baseline 대박 0/0/0, 베스트 2/1/1 — **검증 종료 후에도 동일** |
| Q2 | ✅ | 2행, 교차 대응 정확 |
| Q1 | ✅ | 파생 전부 기대값 일치 |
| Q3 | ✅ | 0행 |
| R1 | ✅ | 베스트 → 아현 카드 (1000/50, `routing-verify-A-ahyeon`, 아현·2호선) |
| **R2** ★ | ✅ | 베스트 → 강남 미표시. 검색창 `강남` 0건 |
| R3 | ✅ | 대박 → 강남 카드 (2000/80, `routing-verify-B-gangnam`, 강남·2호선·신분당선) |
| **R4** ★ | ✅ | 대박 → 아현 미표시. 검색창 `아현` 0건 |
| **R5** ★ | ✅ | 베스트 → 강남 요청서 URL 직접 진입 시 차단 |
| **R5b** ★ | ✅ | 대박 → 아현 요청서 URL 직접 진입 시 차단 |
| **T14** ★ | ✅ | `resolve_chat_customer_id('c8ab5299-…')` → `200`, `4b20f04b-…d84` (고객 정확) |
| **R10** ★ | ✅ | `200` / rows 1 / keys **19** / leaked **[]** (제외 10종 키 부재) |
| R9 | ✅ | 고객 세션 → `200`, `[]` |
| R8 | ✅ | 마이페이지 전체 9 / 진행중 4 / 받은응답 1, 신규 2건 표시, 신촌 상세에 `베스트공인중개사사무소`, 콘솔 에러 0 |
| R6 | 🚫 | 030 이후 |
| R7 | — | 미검증 — 대상 부재 (TODO 49번) |

> **R5/R5b 라벨 주의**: 실행 시 두 라벨이 서로 바뀌어 기록됐다(R5=베스트→강남,
> R5b=대박→아현). 위 표는 **실행된 내용 그대로** 적었다. 두 방향이 모두 덮였으므로
> 판정에는 영향이 없다.

### R11 — 030 적용 전 baseline (다시 관측할 수 없는 값)

| 항목 | 값 |
| --- | --- |
| `GET /rest/v1/requests?select=*` (베스트 세션) | `200` |
| rows | **10** (open 4 / closed 6) |
| keys | **26** |
| `customer_id` 포함 | **true** |

**이것은 FAIL이 아니라 030이 닫으려는 구멍의 실측 증거다.** 030:30-37이 서술한
"승인만 받으면 전국 모든 요청서를 통째로 덤프할 수 있는 상태"가 실재했음을 확인했다.

030 적용 후 **T1/T2는 같은 호출이 `200` + rows **0**이 되어야 한다.** 이 baseline이
없으면 그 0행은 "차단됐다"인지 "원래 없었다"인지 구분되지 않는다.

같은 세션에서 RPC(R10)는 19키·leaked 0을 반환했다 — 테이블 직접 조회 26키와의 대비가
029 컬럼 allowlist가 실제로 작동한다는 증거다.

---

## 6.7. 030 적용 후 실측 (2026-08-11) — T1 / T2 통과

| # | 확인 | 030 직전 (R11) | 030 직후 | 판정 |
| --- | --- | --- | --- | --- |
| **T1** | 중개사 `GET /requests?select=*` | `200` / rows **10** / keys 26 / `customer_id` 있음 | `200` / rows **0** | ✅ |
| **T2** | 중개사 `rpc/list_open_requests_for_realtor` | 1행 | **1행**, 아현 카드 정상 | ✅ |
| — | 고객 `GET /requests?select=*` | — | **9행** (총 10건 중 본인 것만) | ✅ |

구조 검증 V1/V2/V3 전부 통과. 상세는 `TODO_PHASE2.md` 「migration 030 적용 완료」.

고객 9행이 정답인 근거: `user@naver.com` legacy 7 + 신규 2 = 9, 나머지 1건은
`ts930728@naver.com` 소유. 10행이면 정책이 헐거운 것이고 7행이면 신규가 누락된 것이다.

---

## 8. 남은 항목 — R6 (승인 필요) / R8 재확인

### 8-1. R6-pre — 정책 술어 진리표 (read-only, 지금 가능)

R6 본 시험 전에 **정책의 `exists` 술어가 네 조합에서 올바른지 먼저 본다.** INSERT 를 하지
않고 술어만 그대로 평가하므로 write 가 없다. SQL Editor 에서 실행한다.

```sql
-- R6-pre: properties_insert_realtor 의 exists 절을 그대로 평가한다 (INSERT 하지 않음)
with req as (
  select id,
         case when extra_note = 'routing-verify-A-ahyeon' then '아현(11410)'
              else '강남(11680)' end as label
  from requests
  where extra_note in ('routing-verify-A-ahyeon', 'routing-verify-B-gangnam')
),
rt as (
  select id, nickname from profiles where role = 'realtor'
)
select rt.nickname                as realtor,
       req.label                  as request,
       exists (
         select 1
         from requests r
         join realtor_service_areas sa on sa.district_code = r.district_code
         where r.id = req.id
           and sa.realtor_id = rt.id
           and sa.area_type  = 'district'
       )                          as would_pass
from rt cross join req
order by rt.nickname, req.label;
```

**기대 — 4행, 대각선만 true**

| realtor | request | would_pass |
| --- | --- | --- |
| 대박공인중개사 | 강남(11680) | **true** |
| 대박공인중개사 | 아현(11410) | **false** ← R6 이 노리는 조합 |
| 베스트공인중개사사무소 | 강남(11680) | **false** |
| 베스트공인중개사사무소 | 아현(11410) | **true** |

★ **양성 2건이 여기서 확인된다는 점이 중요하다.** R6 본 시험은 거부만 보므로, 정책이
과하게 조여 정상 응답까지 막는 경우를 잡지 못한다. `would_pass = true` 2건이 그 반대편을
덮는다. (실제 INSERT 성공까지의 확인은 034 의 T16-b 소관 — 11월)

이 쿼리는 `auth.uid()` 대신 `realtor_id` 를 명시 대입한다. 따라서 **술어 논리만** 검증하고
RLS 배선(세션에서 `auth.uid()` 가 제대로 잡히는지)은 검증하지 않는다. 배선은 이미 T1/T2 가
증명했다 — 같은 `current_user_role()`/`auth.uid()` 경로를 탄다.

### 8-2. R6 본 시험 — ⚠ 승인 필요 (INSERT 시도)

| 항목 | 내용 |
| --- | --- |
| 확인 | 030 의 `properties_insert_realtor` 가 영업지역 밖 요청서 응답을 실제로 막는가 |
| 계정 | `test2@naver.com`(대박, 강남구) → **아현 요청서**(서대문구)에 INSERT 시도 |
| PASS | `42501` / `new row violates row-level security policy for table "properties"` |
| FAIL | `201` — 행이 생성됨 |

⚠ **이것은 write 시도다.** PASS 면 아무 행도 생기지 않지만, **FAIL 이면 정확히 그 이유로
행이 생긴다.** 정리 쿼리를 미리 준비해 두고 실행한다. CLAUDE.md 11번 승인 대상으로 취급한다.

UI 로는 판정할 수 없다 — `RealtorRespond.jsx:89-96` 이 `get_open_request_for_realtor()` 가
0행이면 응답 폼을 렌더하기 전에 early return 한다. API 레이어에서 직접 호출한다.

**대박 세션** 콘솔에서 4절의 공통 헬퍼(`api`)를 붙여넣은 뒤:

```js
// R6: 영업지역 밖 요청서에 응답 매물 INSERT 시도
const AHYEON_REQUEST_ID = '<Q1 에서 확인한 아현 요청서 id>'
const r6 = await api('properties', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({
    request_id:   AHYEON_REQUEST_ID,
    realtor_id:   'e17d5f3d-39c8-43ed-a518-07b9b9b3fdf0',  // 대박
    title:        'r6-should-be-rejected',
    address:      'r6-test',
    deposit:      1000,
    monthly_rent: 50,
    room_type:    'one_room',
  }),
})
console.log(r6.status, r6.body)
```

| 결과 | 판정 |
| --- | --- |
| `403` + `code: '42501'` | **PASS** — 행 없음. 추가 조치 불필요 |
| `201` + 생성된 행 | **FAIL** — 아래 정리 쿼리를 즉시 실행하고 보고 |

```sql
-- R6 이 FAIL 했을 때만 실행. PASS 면 0행이므로 돌릴 필요 없다
select id, request_id, realtor_id, title, created_at
from properties where title = 'r6-should-be-rejected';
-- 확인 후: delete from properties where title = 'r6-should-be-rejected';
```

★ 삭제 시 주의: `increment_response_count()` 트리거가 INSERT 때 `requests.response_count`
를 +1 해 두었을 수 있다. 행을 지워도 카운터는 자동으로 줄지 않는다(감소 트리거 없음).
FAIL 이면 `response_count` 원복까지 함께 판단한다.

### ✅ 8-1 실행 결과 (2026-08-11) — 통과

4행, 대각선만 true. 기대표와 정확히 일치.

| realtor | request | would_pass |
| --- | --- | --- |
| 대박공인중개사 | 강남(11680) | **true** |
| 대박공인중개사 | 아현(11410) | **false** ← R6 이 노리는 조합 |
| 베스트공인중개사사무소 | 강남(11680) | **false** |
| 베스트공인중개사사무소 | 아현(11410) | **true** |

★ 이 결과는 **정책 술어가 양방향으로 옳다**는 것까지 보여준다 — 막아야 할 2건이 false 이고,
**통과시켜야 할 2건이 true** 다. R6 본 시험(거부만 확인)만으로는 후자를 알 수 없다.
정책이 과하게 조여 정상 응답까지 막는 경우는 여기서 배제됐다.

남은 것은 "이 술어가 실제 INSERT 경로에서 RLS 로 집행되는가" 하나이며, 그것이 8-2 다.

### ✅ 8-2 실행 결과 (2026-08-11) — R6 PASS

**fixture (실측 재확보, 추정 아님)**

| 대상 | UUID | 구 | 상태 |
| --- | --- | --- | --- |
| 베스트공인중개사사무소 | `b28f1e03-db3f-4faa-be52-eba2f7d50294` | `11410` 서대문구 | realtor |
| 대박공인중개사 | `e17d5f3d-39c8-43ed-a518-07b9b9b3fdf0` | `11680` 강남구 | realtor |
| 요청서 A `routing-verify-A-ahyeon` | `23c776e4-aa8b-4679-8956-39e0ef1ee9a2` | `11410` | open, `response_count` 0 |
| 요청서 B `routing-verify-B-gangnam` | `72f9a170-6092-4edb-80e5-568ec6ea6740` | `11680` | open, `response_count` 0 |

**사전 조건**: C0 collision **0행** (`properties_request_realtor_unique` 와 섞이지 않음).
C1 캡처 — 강남 `response_count` = **0**.

**시험**: 베스트(11410) 세션 → 강남 요청서(11680)에 `POST /rest/v1/properties` **1회**.
payload 는 `properties.api.js:14-23` 의 `createPropertyResponse()` 와 키 8개가 동일하다.

**실제 응답 (문자열 고정 없이 그대로 기록)**

```
status 403
body   { code: '42501', details: null, hint: null,
         message: 'new row violates row-level security policy for table "properties"' }
```

**무변경 확인 — 판정의 실질 근거**

| 확인 | 결과 |
| --- | --- |
| `properties` where realtor=베스트 and request=강남 | **0행** |
| `properties` where title='r6-should-be-rejected' | **0행** |
| 강남 `response_count` | **0** — C1 과 동일 |
| Q0-C | 대박 0/0/0 · 베스트 2/1/1 — **변화 없음** |

★ **`response_count` 불변이 단순 중복 확인이 아니다.** `trg_increment_response_count` 는
`after insert on properties` 다(schema.sql:117-119). 카운터가 움직이지 않았다는 것은
**INSERT 가 아예 성립하지 않았다**는 뜻이며, "행이 생겼다가 정리됐다"와 구분된다.

**cleanup 불필요** — 행 미생성, 카운터 불변. 8-2 의 cleanup 초안은 실행하지 않았다.

**★ positive dynamic INSERT 는 실행하지 않았다.** 아현에 실제 응답을 넣지 않았고
Q0-C baseline 을 보존했다. 정책이 과도하게 조여 정상 응답까지 막는 경우는
**R6-pre 진리표의 `would_pass = true` 2건**(정적 술어 평가)으로만 배제했다.
**실제 성공 INSERT 검증은 migration_034 의 T16-b 소관이다(2026-11).**

**판정 한계**: SQL Editor 는 `auth.uid()` 컨텍스트가 없어 정책을 런타임 그대로 재현하지
못한다. 특히 `realtor_id = auth.uid()` 절은 SQL 로 평가할 수 없다. R6 판정은 아래 5개의
**조합**으로 성립한다 — 어느 하나 단독으로는 성립하지 않는다.

1. 실제 브라우저 세션(`auth.uid()` 유효)에서 INSERT 가 거부됨 — c1 포함 전 조건 통과
2. 행 수 0 + `response_count` 불변 — "에러가 났다"가 아니라 "반영되지 않았다"
3. R6-pre 술어 진리표 4행 대각선 — **양성 2건 포함**, 과도 차단 배제
4. T2/R1 — 베스트의 아현 scoped 접근 성공(정책·RPC 배선이 살아 있음)
5. policy expression 정적 분석

### 8-3. R8 재확인 — 030 후 고객 화면 회귀

API 레벨(9행)은 이미 확인됐다. **화면 회귀만 남았다.** write 없음.

`user@naver.com` 로그인 후:

| 확인 | PASS 조건 |
| --- | --- |
| `/mypage` 요청서 목록 | 전체 **9** / 진행중 **4** — 030 직전 값과 동일 |
| 신규 2건(아현·강남) | 목록에 표시 |
| 요청서 `cc193972-…` 상세 | 응답 카드에 **`베스트공인중개사사무소`** 표시 |
| 같은 화면 채팅 진입 | 정상 진입, 상대 닉네임 표시 |
| 콘솔 | 에러 0건 |

**변화가 없어야 하는 것이 기대값이다.** 030 은 `requests` SELECT 정책을
`own_or_realtor` → `own_or_admin` 으로 바꿨지만, 고객에게 적용되는 절
(`created_by = auth.uid() or customer_id = auth.uid()`)은 양쪽에 동일하다.
6.5절 R8 의 값(전체 9 / 진행중 4 / 받은응답 1)과 그대로 맞아야 한다.

★ 채팅 진입까지 확인하는 이유: 022 의 `get_chat_participants` 와 029 의
`resolve_chat_customer_id` 는 030 이 건드리지 않지만, `profiles`·`requests` 정책이
동시에 걸리는 유일한 화면이라 회귀가 드러난다면 여기다.

### ✅ 8-3 실행 결과 (2026-08-11) — 통과

| 확인 | 결과 |
| --- | --- |
| `/mypage` 요청서 목록 | 전체 **9** / 진행중 **4** — 6.5절 R8(030 직전)과 **동일** |
| 신규 2건(아현·강남) | 표시됨 |
| `cc193972-…` 상세 | 응답 카드에 `베스트공인중개사사무소` 표시 |
| 채팅 진입 | 정상 — 헤더 닉네임 / 매물 정보 / 기존 메시지 양방향 표시 |
| 콘솔 | 에러 **0건** |

**030 전후 값이 같다는 것이 PASS 조건이었고, 그대로 같았다.** 고객에게 적용되는 정책 절
(`created_by = auth.uid() or customer_id = auth.uid()`)이 `own_or_realtor` 와
`own_or_admin` 양쪽에 동일하므로 기대대로다.

채팅이 정상 동작한 것은 022 RPC(`get_chat_participants`)와 029 RPC
(`resolve_chat_customer_id`)가 030 이후에도 살아 있음을 고객 방향에서 확인해 준다
(중개사 방향은 T14 가 확인했다).

---

## 9. 남은 것 — 다음 세션

**write 없는 항목은 2026-08-11 로 전부 닫혔다.**

**2026-08-11: R6 본 시험까지 완료됐다.** 아래는 그 이후로 남은 것이다.

| # | 내용 | 왜 남았나 |
| --- | --- | --- |
| **031** | 다중 매물 응답 (`properties_request_realtor_unique` 제거) | ⚠ 중복 응답 발생 후 **무손실 롤백이 불가능**하다. 적용 전 **5개 테이블** 백업이 선행 조건 — 대상·근거·READY 게이트는 **`TODO_PHASE2.md` 「031 백업 설계」가 기준**이다(2026-08-11 갱신, 여기 중복 기록하지 않음) |
| **032** | requests CHECK 제약 | 전제 ② `extra_note` maxLength=300 + 카운터가 **미구현**(TODO 40번). `ExtraStep.jsx` 에 `maxLength` 없음. **032 직전에 처리할 것** |
| **034** | 030 4-2 이월분 | 11월 신규 중개사 승인 플로우 때. T16-a/T16-b 동반 (TODO 50번) |
| **R7** | 영업지역 없는 중개사 0행 | 미검증 — 대상 부재. 034 와 같은 시점 (TODO 49번) |

★ **이 파일은 R6 본 시험이 끝나면 결과를 `TODO_PHASE2.md` 로 옮기고 삭제한다.**
지금 지우면 8-2 절차와 R11 baseline 대조표가 함께 사라진다.

---

## 7. 결과 기록 양식

```
Q0-A fixture 확정: PASS / FAIL  (아현=____ / 강남=____)
Q0-B 표식 미선점:  PASS / FAIL
Q0-C baseline:     베스트=__행 / 대박=__행
Q2  영업지역:      PASS / FAIL
Q1  파생 게이트:   PASS / FAIL  (A district_code=____ / B district_code=____)
Q3  응답 이력 0행: PASS / FAIL

R1  aaa  아현 보임          PASS / FAIL
R2  aaa  강남 안 보임 ★     PASS / FAIL
R3  test2 강남 보임         PASS / FAIL
R4  test2 아현 안 보임 ★    PASS / FAIL
R5  test2 A 직접진입 차단 ★ PASS / FAIL
R5b aaa  B 직접진입 차단 ★  PASS / FAIL
R8  고객 화면 회귀          PASS / FAIL
R9  고객→중개사 RPC 0행     PASS / FAIL
R10 반환 키 10종 부재 ★     PASS / FAIL

R6  030 이후               미실행
T1/T2 030 이후             미실행
R7  미검증 — 대상 부재      (uncovered realtor 0명 / 11월 승인 플로우로 이월)

Q0-C 재확인 (검증 종료 후): 베스트=__행 / 대박=__행  ← 시작값과 동일해야 한다
```

★ 표시 항목 중 하나라도 FAIL이면 **030을 적용하지 않는다.**
