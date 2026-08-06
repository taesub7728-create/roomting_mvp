-- 마이그레이션 025: stations / lines / station_lines (역·노선·환승)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_024_districts.sql까지 먼저 실행되어 있어야 함
--
-- 설계 의도:
--   1) stations는 "물리적 역사"가 아니라 "고객이 고르는 하나의 지점" 단위다.
--      환승역은 노선 수와 무관하게 1행이고, 환승 관계는 station_lines 행이 2개 이상인
--      것으로 표현한다. 별도 transfer 테이블을 만들지 않는다.
--
--   2) 역명에 unique 제약을 걸지 않는다. 확장축(1)로 경기/인천을 열면 동명이역이
--      실재한다(서울 5호선 양평역 / 경기 중앙선 양평역).
--
--      ★ canonical key = normalize_station_query(name_ko) + primary district_code 는
--        "병합 후보를 모으는 그룹핑 키"일 뿐이며, 이것만으로 자동 병합을 확정하지 않는다.
--
--      [병합 확정 조건] 아래를 전부 충족해야 자동 병합한다:
--        (1) 정규화 역명 일치
--        (2) primary district 일치
--        (3) 좌표 거리 <= 1.5km   (김포공항/디지털미디어시티급 최장 환승통로를 담되
--                                 인접 역과 섞이지 않는 값. 시드 후 분포 보고 조정)
--        (4) 표준데이터의 환승역 구분 = 'Y'
--        (5) 표준데이터의 환승 노선 목록에 상대 노선이 포함
--
--      하나라도 불충족 -> 자동 병합 금지. 검수 리포트로 보내고 별개 역으로 분리 보존한다.
--      특히 운영기관이 다르면서 (4)(5)를 만족하지 않으면 별개 역으로 강하게 의심한다.
--
--      대표 사례: 신촌
--        2호선 신촌역(서울교통공사)과 경의중앙선 신촌역(코레일)은 이름이 같고 약 400m
--        거리이며 같은 서대문구지만 공식 환승 관계가 아니다 -> 자동 병합하지 않는다.
--        (027의 백필 주석 참고)
--
--      [값 충돌 시 우선 소스]
--        좌표                     -> 병합된 노선 중 lines.display_order가 가장 낮은 노선의 좌표.
--                                    평균을 쓰지 않는다. 승강장이 먼 환승역에서 평균점은 실제로
--                                    어떤 출입구도 아닌 지점이 되고, 재적재 시 값이 흔들린다.
--        name_ko/en/hanja         -> 표준데이터(국가철도공단) 우선
--        name_ja/zh               -> 서울교통공사 역명다국어표기 우선
--        불일치 표기              -> 버리지 않고 station_aliases에 kind='legacy'로 전부 등록
--
--      [검수 리포트] scripts/seed-stations/merge_report.csv
--        canonical_key, name_ko, district, merged_line_count, merged_lines, station_codes,
--        coord_spread_m, name_variants, official_transfer_flag, transfer_line_match,
--        operator_differs, ja_missing, zh_missing, decision, needs_review, review_reason
--        -> coord_spread_m 내림차순 정렬. needs_review=true 건만 사람이 본다.
--
--   3) name_hanja를 둔다. ja/zh 역명이 결손일 때의 폴백 체인에 쓴다:
--        ja: name_ja -> name_hanja -> name_en -> name_ko
--        zh: name_zh -> name_hanja -> name_en -> name_ko
--        en: name_en -> name_ko
--      근거: 역명판/노선도 실물이 한글+로마자를 병기하므로, 읽지 못하는 한글보다
--      로마자가 낫다. 한자권 사용자에게는 한자가 로마자보다 낫다.
--      검수되지 않은 값은 채우지 않고 null로 둔다(추측 금지).
--
--   4) zh를 간체/번체 컬럼으로 나누지 않는다. 앱의 lang은 'zh' 하나이고 공공데이터도
--      간체만 제공한다. 번체 검색 대응은 station_aliases 행으로 처리한다(025).
--
--   5) 폐역/개명은 삭제하지 않는다. is_active=false로 두고 옛 이름은 별칭으로 남긴다.
--      과거 요청서가 station_id를 참조 중이기 때문이다.
--
-- 데이터 출처:
--   주   - 전국도시철도역사정보표준데이터 (국가철도공단, data.go.kr/data/15013205)
--          위경도/영문/한자/환승/도로명주소. 연 1회 갱신
--   보강 - 서울교통공사_역명다국어표기 (data.go.kr/data/15044232) 1~8호선 ja/zh
--
-- 영향 범위:
--   변경 대상: 신규 테이블 3개
--   영향 받는 기능: 없음 (requests와의 연결은 027에서 이뤄짐)
--   영향 없음: 기존 테이블 전부 / 기존 RLS / 인증 흐름


-- ========================================
-- 1. lines (노선)
-- ========================================
create table lines (
  id             uuid primary key default gen_random_uuid(),
  line_code      text,                      -- 표준데이터 노선번호
  name_ko        text not null,
  name_en        text,
  name_ja        text,
  name_zh        text,
  operator       text,                      -- 운영기관명
  display_order  integer not null,          -- 1호선 -> 2호선 -> ... -> 광역/신설 순 정렬
  source         text not null,
  source_version text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_lines_display_order on lines(display_order);


-- ========================================
-- 2. stations (역)
-- ========================================
create table stations (
  id             uuid primary key default gen_random_uuid(),
  station_code   text,                      -- 표준데이터 역번호. 출처 추적용이며 unique가 아니다
                                            -- (환승역을 1행으로 병합하면서 대표 코드 하나만 남김)
  name_ko        text not null,
  name_en        text,
  name_hanja     text,                      -- 폴백 체인용 (위 설계 의도 3 참고)
  name_ja        text,                      -- 결손 시 null. 추측 값을 넣지 않는다
  name_zh        text,                      -- 간체
  latitude       double precision not null,
  longitude      double precision not null,
  is_active      boolean not null default true,
  source         text not null,
  source_version text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint stations_lat_range check (latitude between 33 and 39),
  constraint stations_lng_range check (longitude between 124 and 132)
);

create index idx_stations_active on stations(id) where is_active;
create index idx_stations_name_ko on stations(name_ko);


-- ========================================
-- 3. station_lines (역-노선 다대다 = 환승 관계)
--    행이 2개 이상이면 환승역이다.
--    화면 표시 "2호선 · 공항철도 · 경의중앙선"은 이 조인을 lines.display_order로
--    정렬해서 만든다. 단일 노선이면 "3호선"만 나온다 - 괄호 표기는 쓰지 않는다
--    (환승역 오해를 만들기 때문).
-- ========================================
create table station_lines (
  station_id uuid not null references stations(id) on delete cascade,
  line_id    uuid not null references lines(id) on delete cascade,
  primary key (station_id, line_id)
);

create index idx_station_lines_line on station_lines(line_id);


-- ========================================
-- RLS: 역/노선 정보는 공개 정보. 비로그인 사용자도 요청서 작성 전 역 검색을 하므로
--      anon에도 읽기를 허용한다. 쓰기 정책은 만들지 않는다(시드는 SQL Editor 전용).
-- ========================================
alter table lines enable row level security;
alter table stations enable row level security;
alter table station_lines enable row level security;

create policy "lines_select_all" on lines
  for select to authenticated, anon using (true);

create policy "stations_select_all" on stations
  for select to authenticated, anon using (is_active);

create policy "station_lines_select_all" on station_lines
  for select to authenticated, anon using (true);


-- ========================================
-- 롤백 (순서 주의: 자식 테이블부터)
-- ========================================
-- drop table if exists station_lines;
-- drop table if exists stations;
-- drop table if exists lines;
