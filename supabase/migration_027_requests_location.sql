-- 마이그레이션 027: requests 지역 구조화 컬럼 + 서버측 파생 트리거
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_026_station_mapping_search.sql까지 먼저 실행되어 있어야 함
--
-- ============================================================================
-- 설계 의도
-- ============================================================================
--
-- [1] location_type enum에 미래 값(district/landmark/coordinate)을 미리 정의하되
--     CHECK로 station만 허용한다.
--     근거: ALTER TYPE ADD VALUE로 추가한 값은 같은 트랜잭션에서 쓸 수 없어 migration을
--     두 번 나눠야 한다. CHECK가 실제 허용값을 막고 있으므로 enum 정의만으로는 위험이
--     없다. migration_020의 property_category와 동일한 기존 패턴이다.
--     확장 시에는 이 CHECK만 교체하는 새 migration 파일 1개면 된다.
--
-- [2] district_code를 requests에 비정규화 저장한다.
--     station_id로 매번 조인해 구할 수 있는데도 컬럼을 두는 이유:
--       (a) 라우팅 쿼리가 3-way 조인에서 단순 비교가 된다
--       (b) 작성 시점의 구를 고정한다. 역의 구 매핑을 나중에 고쳐도 과거 요청서의
--           라우팅이 흔들리지 않는다  <- 이쪽이 더 중요한 이유다
--
-- [3] location_lat/lng는 확장축(2)(지도 핀)용이다. 지금은 선택한 역의 좌표를
--     스냅샷으로 복사한다. 중개사에게는 절대 반환하지 않는다(029의 RPC 반환 목록에서
--     영구 제외). 반환하지 않으므로 get_public_listings()식 근사화가 불필요하다.
--
-- [4] requests_station_location_complete CHECK를 여기서 걸지 않는다.
--     NOT VALID는 기존 행 검사만 건너뛰고 신규 INSERT는 그대로 막는다. LocationStep
--     자동완성 UI가 배포되기 전까지는 station_id 없는 요청서가 들어오므로, 지금 걸면
--     모든 신규 요청서 제출이 CHECK 위반으로 실패한다. UI 배포 이후 032에서 건다.
--
-- [5] region_text는 not null 그대로 유지한다. 사용자 언어의 표시 문자열이며
--     라우팅에 쓰지 않는다. 중개사 화면에는 이 값 대신 서버가 stations에서 만든
--     한국어 표시 데이터(station_name_ko / line_names / district_name_ko)를 보여준다.
--     -> 위조 문제와 "중개사가 일본어 지역명을 보는" 기존 결함이 함께 해결된다.
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: requests 컬럼 5개 + enum 1개 + 트리거 함수 1개 + 트리거 1개
--             / 파일: 없음(프론트는 이후 단계)
--             / API: 없음 (createRequest()는 새 컬럼을 보내지 않아도 동작)
--             / 사용자 흐름: 없음
--   영향 받는 기능: 없음. 전부 nullable이고 location_type CHECK는 default를 항상 만족한다.
--   영향 없음:
--     - createRequest(): 새 컬럼 미전송 -> location_type이 default 'station'으로 채워짐.
--       단 station_id가 null이면 아래 트리거가 예외를 던지므로, [4]의 이유로
--       트리거는 station_id가 null일 때 통과시킨다(아래 주석 참고).
--     - listOpenRequests()/getRequestById(): select('*')라 새 컬럼이 딸려오지만 화면이 무시함
--     - classifySubmitFailure(): INSERT 경로가 바뀌지 않으므로 기존 에러 분류 그대로 유효


-- ========================================
-- 1. location_type enum + 컬럼
-- ========================================
create type location_type as enum ('station', 'district', 'landmark', 'coordinate');

alter table requests
  add column if not exists location_type location_type not null default 'station',
  add column if not exists station_id    uuid references stations(id),
  add column if not exists district_code text references districts(code),
  add column if not exists location_lat  double precision,
  add column if not exists location_lng  double precision;

-- 서버 측 강제: DevTools/직접 API 호출로도 station 외 값은 저장 불가
alter table requests
  add constraint requests_location_type_station_only
  check (location_type = 'station');

-- 라우팅 조회용 (029의 list_open_requests_for_realtor가 쓴다)
create index idx_requests_routing
  on requests(district_code, created_at desc) where status = 'open';


-- ========================================
-- 2. 서버측 파생 트리거
--
--    문제: 클라이언트가 station_id, district_code, location_lat, location_lng를 각각
--    보내면 서로 불일치하는 조합을 만들 수 있다.
--      예) station_id = 홍대입구역, district_code = 강남구
--          -> 강남구 중개사에게 홍대 요청서가 전달되는 우회
--    고객이 하는 조작이라 동기는 약하지만, 서버가 클라이언트 값을 검증 없이 신뢰하는
--    구조 자체가 문제다.
--
--    해결: station_id만 신뢰하고 나머지는 서버가 채운다. 클라이언트가 보낸
--    district_code/lat/lng는 읽지 않고 덮어쓴다.
--
--    왜 트리거인가 (RPC 전환 대신):
--      (a) 성격이 검증(rejection)이 아니라 파생(derivation)이다.
--          increment_response_count()/handle_new_user()와 같은 범주이며,
--          이 코드베이스에 이미 있는 패턴이다.
--      (b) requests_insert_own RLS(migration_018의 심사 대기자 차단 포함)가 그대로
--          유효하다. RPC로 옮기면 그 정책을 다시 만들어야 한다.
--      (c) 결정적 이유: createRequest()를 RPC로 바꾸면 Phase 2에서 실측 기반으로 만든
--          classifySubmitFailure()가 전부 재검증 대상이 된다. 그 함수는 PostgREST가
--          테이블 INSERT 실패를 반환하는 형태(code 23514 + message 문자열 파싱)에 맞춰
--          만든 것이라, 함수 컨텍스트를 통과하면 조용히 깨질 수 있다.
--          트리거는 INSERT 경로를 그대로 두므로 이 위험이 0이다.
--      (d) 프론트/API 직접호출/admin/향후 에이전트 대리작성 모든 경로에 자동 적용된다.
--
--    UPDATE 대상 컬럼을 좁히는 이유:
--      - 그냥 `before update`면 closeRequest()의 status 변경에도 발동한다. 나중에 역이
--        폐역(is_active=false)되면 무관한 업데이트가 실패한다.
--      - 반대로 station_id만 지정하면 `update requests set district_code='11680'` 우회가
--        열린다.
--      -> 위치 관련 5개 컬럼 전부를 대상으로 잡아야 두 문제가 함께 닫힌다.
--
--    station_id가 null이면 통과시킨다:
--      032에서 completeness CHECK를 걸기 전까지는 station_id 없는 요청서가 정상이다.
--      여기서 막으면 LocationStep UI 배포 전에 요청서 제출이 전면 실패한다([4] 참고).
--      "station_id는 필수"는 032의 CHECK가 책임진다.
--
--    SECURITY DEFINER 사유:
--      stations/station_districts는 현재 공개 읽기라 필수는 아니지만, 기존 트리거 함수
--      2개와 컨벤션을 맞추고 향후 그 테이블의 RLS가 조여져도 트리거가 깨지지 않게 한다.
--      본문은 공개 참조 테이블만 읽고, 사용자 입력을 쿼리 문자열에 넣지 않으며,
--      동적 SQL이 없다.
-- ========================================
create or replace function public.fill_request_location()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_district text;
  v_lat      double precision;
  v_lng      double precision;
begin
  if new.location_type <> 'station' then
    return new;   -- 현재 CHECK가 station만 허용하므로 도달하지 않는다(확장 대비)
  end if;

  -- 032 이전: 역 미선택 요청서를 허용한다. 이때 파생 컬럼은 전부 비운다
  -- (클라이언트가 station_id 없이 district_code만 보내는 우회를 여기서 막는다).
  if new.station_id is null then
    new.district_code := null;
    new.location_lat  := null;
    new.location_lng  := null;
    return new;
  end if;

  select sd.district_code, s.latitude, s.longitude
    into v_district, v_lat, v_lng
  from public.stations s
  join public.station_districts sd
    on sd.station_id = s.id and sd.is_primary
  where s.id = new.station_id
    and s.is_active;

  if v_district is null then
    raise exception 'unknown or inactive station: %', new.station_id
      using errcode = '23503';
  end if;

  -- 클라이언트가 보낸 값은 무시하고 서버 값으로 덮어쓴다
  new.district_code := v_district;
  new.location_lat  := v_lat;
  new.location_lng  := v_lng;

  return new;
end;
$$;

create trigger trg_fill_request_location
  before insert or update of station_id, location_type, district_code, location_lat, location_lng
  on requests
  for each row execute function public.fill_request_location();


-- ========================================
-- 기존 region_text 백필 계획 (별도 승인 후 실행 - CLAUDE.md 11번)
--
-- 실측 결과: 요청서 8건, 고유 지역 문자열 5개, 전부 6자 이하 한국어, 개인정보 패턴 0건.
--   홍대입구 3건(open 0) / 신촌 2건(open 1) / 이태원 1건(open 0) /
--   건대입구 1건(open 0) / 강남 1건(open 1)
--
-- 이 규모에서 별칭 정규화 매칭기를 만드는 것은 명백한 과잉이므로 수동 매핑한다.
--   홍대입구  -> 홍대입구역 (2호선/공항철도/경의중앙선, 마포구)   공식 환승역, 단일 후보
--   이태원    -> 이태원역   (6호선, 용산구)                      단일 노선
--   건대입구  -> 건대입구역 (2호선/7호선, 광진구)                 공식 환승역
--   강남      -> 강남역     (2호선/신분당선, 강남구)              공식 환승역
--   신촌      -> ★ 아래 참고
--
-- ★★ 신촌 백필은 확정 사실이 아니라 "추정값"이다 ★★
--
--   신촌역은 2호선 신촌역과 경의중앙선 신촌역 두 개가 별개로 존재한다.
--   약 400m 떨어져 있고 공식 환승 관계가 아니므로 시드 스크립트의 병합 규칙(025 설계 의도 참고)에서 자동 병합되지
--   않고 검수 리포트로 분리된다(운영기관도 서울교통공사 / 코레일로 다르다).
--
--   사용자가 요청서에 "신촌"이라고 적었을 때 어느 역을 의도했는지는 확정할 수 없다.
--   두 역 모두 서대문구라 district_code가 같아 라우팅 결과는 동일하지만,
--   station_id는 하나를 골라야 한다.
--
--   운영상 기본값으로 2호선 신촌역을 쓴다(통칭 "신촌"이 일반적으로 가리키는 대상,
--   이용객 규모). 이는 추정이며, 나중에 이 값을 근거로 다른 판단을 하지 말 것.
--   검수 리포트(merge_report.csv)와 TODO_PHASE2.md에도 같은 내용을 남긴다.
--
-- 매핑 실패분 처리:
--   closed(6건)는 라우팅 대상이 아니므로 null로 두어도 피해가 없다.
--   open(2건: 신촌 1, 강남 1)은 station_id가 없으면 어떤 중개사에게도 보이지 않으므로
--   반드시 채운다.
-- ========================================

-- ========================================
-- 적용 후 확인
-- ========================================
-- 기존 8행이 전부 location_type='station', station_id=null 상태인지
--   select location_type, count(*) filter (where station_id is null) as no_station, count(*)
--   from requests group by 1;
--
-- 불일치 위조 차단 확인 (시드 적재 후, begin/rollback으로)
--   begin;
--   insert into requests (customer_id, created_by, region_text, station_id, district_code)
--   values ('<고객uuid>','<고객uuid>','테스트','<홍대입구 station_id>','11680');  -- 강남구 위조
--   select district_code from requests order by created_at desc limit 1;  -- 11440(마포구)이어야 함
--   rollback;


-- ========================================
-- 롤백
-- ========================================
-- drop trigger if exists trg_fill_request_location on requests;
-- drop function if exists public.fill_request_location();
-- drop index if exists idx_requests_routing;
-- alter table requests drop constraint if exists requests_location_type_station_only;
-- alter table requests
--   drop column if exists location_lng,
--   drop column if exists location_lat,
--   drop column if exists district_code,
--   drop column if exists station_id,
--   drop column if exists location_type;
-- drop type if exists location_type;
