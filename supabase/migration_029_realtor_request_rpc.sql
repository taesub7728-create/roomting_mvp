-- 마이그레이션 029: 중개사용 요청서 접근 RPC (정책 변경 없음)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_028_realtor_service_areas.sql까지 먼저 실행되어 있어야 함
--
-- ============================================================================
-- ★ HARD PREREQUISITE - 프론트 B(resolve_chat_customer_id 전환)와 같은 배포에 묶을 것
-- ============================================================================
--   029 적용 자체는 아무것도 깨뜨리지 않는다. 문제는 030이다.
--
--   프론트 A(2026-08-07 배포)에서 getOrCreatePropertyChatRoom()의
--   `property.requests?.customer_id ?? user.id` 폴백을 없애고, 요청서가 있는데 고객을
--   찾지 못하면 명시적 에러를 반환하도록 바꿨다(chat.api.js). 030이 중개사의 requests
--   전체 SELECT를 없애므로, 그 시점부터 중개사 세션에서는 embedded join이 null이 된다.
--
--   -> 030 적용 후 프론트가 아직 구버전이면, 중개사가 RealtorRespond 완료 화면의
--      "고객과 채팅하기"로 채팅방을 새로 여는 경로가 에러로 막힌다.
--      (프론트 A 이전 코드였다면 대신 customer_id=중개사 본인인 엉뚱한 방이 조용히
--       만들어졌다. 막히는 쪽이 낫지만, 어느 쪽도 정상은 아니다.)
--
--   따라서 순서를 지킨다:
--     029 적용 -> 프론트 B 배포(resolve_chat_customer_id로 전환) -> 030 적용
--   프론트 B 없이 030을 먼저 적용하지 않는다. 자세한 내용은 TODO_PHASE2.md
--   "프론트 B로 이월 - resolve_chat_customer_id() 전환" 항목 참고.
--   (이 파일 5번 함수 resolve_chat_customer_id()가 그 전환의 대상이다)
--
-- ============================================================================
-- 이 파일이 정책을 건드리지 않는 이유
-- ============================================================================
--   RPC 생성(028)과 정책 잠금(029)을 분리하면 프론트 배포와 migration 적용을
--   동시에 할 필요가 없어진다.
--     029 적용  -> 아무것도 안 깨짐. RPC와 기존 테이블 조회가 공존
--     프론트 배포 -> RPC로 전환. 이 시점에 실질 라우팅이 발효된다
--     030 적용  -> 테이블 직접 조회라는 우회로를 닫는다
--   각 단계가 독립적으로 롤백된다. 위험한 중간 상태는 없다 - RPC가 처음부터
--   영업지역 조건을 포함하므로 "전국 open이 보이는 구간"이 생기지 않는다.
--
-- ============================================================================
-- RLS의 한계와 RPC를 택한 이유 (view를 기각한 근거)
-- ============================================================================
--   RLS는 행 수준 보안이라 허용된 행의 모든 컬럼이 노출된다. PostgREST는 select=*를
--   그대로 통과시키므로 customer_id 같은 컬럼을 숨길 수 없다.
--
--   view는 해결책이 아니다:
--     1. PostgreSQL의 view는 기본적으로 소유자 권한으로 기반 테이블에 접근한다.
--        view 소유자가 테이블 소유자면 기반 테이블의 RLS가 적용되지 않는다.
--     2. PG15+의 WITH (security_invoker = true)로 뒤집을 수 있지만, 그러면 중개사가
--        requests 테이블에 SELECT 권한을 가지고 있어야 한다. 그 권한이 있으면
--        PostgREST로 테이블을 직접 때릴 수 있어 view가 아무것도 막지 못한다.
--        반대로 테이블 권한을 회수하면 security_invoker view는 권한 부족으로 실패한다.
--     3. view에는 RLS 정책을 붙일 수 없다.
--
--   -> RPC로 간다. 컬럼 allowlist가 returns table(...)에 명시적으로 박히고,
--      행 필터를 본문에서 하며, 030에서 테이블 조회를 0행으로 만들 수 있다.
--
--   주의: authenticated는 단일 role이라 고객과 중개사가 같다. 테이블 GRANT 회수로
--   중개사만 뺄 수 없으므로, 030은 RLS 정책에서 realtor 분기를 제거하는 방식이다.
--
-- ============================================================================
-- 반환 / 제외 컬럼
-- ============================================================================
--   반환 19개: id, station_name_ko, line_names, district_name_ko,
--             property_category, deal_type, rent_max, deposit_max, deposit_min,
--             jeonse_loan_planned, room_types, contract_months, amenities,
--             extra_note, move_in_date, registration_required,
--             response_count, created_at, my_response_count
--
--   제외 10개와 근거:
--     customer_id      profiles 조인으로 전화번호에 닿는 경로 차단. 이번 작업의 핵심
--     created_by       대리작성자 식별
--     status           open만 반환하므로 무의미
--     response_deadline 내부 운영값
--     station_id       라우팅 내부값
--     district_code    라우팅 내부값
--     location_lat     고객 좌표 비노출(확정사항). 확장축(2) 지도 핀에서 직장/학교
--     location_lng     위치가 들어와도 여기서 영구 차단된다
--     jeonse_loan_detail 자유 서술. 금융 상황 유추 가능
--     region_text      사용자 언어 표시용이라 위조 가능하고, 중개사 화면은 한국어다.
--                      대신 서버가 stations에서 만든 station_name_ko/line_names/
--                      district_name_ko를 반환한다 -> 위조 문제와 "중개사가 일본어
--                      지역명을 보는" 기존 결함이 함께 해결된다
--
--   extra_note는 반환한다. 중개사가 매물을 고르려면 목록에서 내용을 봐야 한다.
--   길이 제한(031) + 연락처 패턴 경고 + 안내 문구는 경감 조치이지 해결이 아니다.
--
-- ============================================================================
-- SECURITY DEFINER 안전 원칙 (전 함수 공통)
-- ============================================================================
--   - 호출자 판정은 auth.uid()로만 한다. realtor_id를 인자로 받지 않는다
--   - set search_path = pg_catalog, public 고정
--   - 본문의 모든 테이블/함수를 schema-qualified로 참조
--   - 동적 SQL 없음, 전부 정적 SQL, stable(부작용 없음)
--   - PUBLIC/anon EXECUTE 회수, authenticated에만 EXECUTE
--   - owner는 postgres(bypassrls)이므로 본문이 유일한 방어선이다.
--     본문 수정은 반드시 T1~T12 전수 테스트를 다시 돌린다
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: 함수 6개 신규 (중개사 측 전용)
--             / 파일: 이후 requests.api.js, properties.api.js, chat.api.js
--
--   ★ 022(profiles_relation_rpc)의 RPC 2개와는 역할이 다르다. 혼동하지 말 것.
--       022  list_request_responses_for_customer / get_chat_participants
--            -> 고객·채팅 측. profiles 컬럼 노출을 막는 것이 목적
--       029  아래 6개
--            -> 중개사 측. requests 컬럼 노출과 영업지역 라우팅이 목적
--     둘은 서로를 호출하지 않고 각자 자기 함수의 GRANT를 책임진다.
--     030의 "함수 권한 위생"은 기존 6개 함수만 대상으로 하며, 022/028/029가 새로
--     만든 함수는 각 파일에서 이미 revoke/grant를 마쳤다.
--   영향 받는 기능: 없음 - 이 시점에는 아무도 호출하지 않는다
--   영향 없음: 기존 정책 전부 / 고객·admin 흐름 / 기존 함수 6개


-- ========================================
-- 1. 목록: 자기 영업지역의 open 요청서
--
--    not exists(이미 응답함) 조건을 넣지 않는다.
--    중개사가 요청서 하나에 매물을 최대 5개까지 보낼 수 있으므로(030), 이미 응답한
--    요청서를 숨기면 추가 제안 경로가 사라진다. 대신 my_response_count를 반환해
--    화면에서 "내가 N개 제안함" 배지로 표시한다.
-- ========================================
create or replace function public.list_open_requests_for_realtor()
returns table (
  id                    uuid,
  station_name_ko       text,
  line_names            text[],
  district_name_ko      text,
  property_category     property_category,
  deal_type             deal_type,
  rent_max              integer,
  deposit_max           integer,
  deposit_min           integer,
  jeonse_loan_planned   boolean,
  room_types            room_type[],
  contract_months       integer,
  amenities             text[],
  extra_note            text,
  move_in_date          date,
  registration_required boolean,
  response_count        integer,
  created_at            timestamptz,
  my_response_count     integer
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    r.id,
    s.name_ko,
    (select array_agg(l.name_ko order by l.display_order)
       from public.station_lines sl
       join public.lines l on l.id = sl.line_id
      where sl.station_id = r.station_id),
    d.name_ko,
    r.property_category, r.deal_type,
    r.rent_max, r.deposit_max, r.deposit_min, r.jeonse_loan_planned,
    r.room_types, r.contract_months, r.amenities,
    r.extra_note, r.move_in_date, r.registration_required,
    r.response_count, r.created_at,
    (select count(*)::integer from public.properties p
      where p.request_id = r.id and p.realtor_id = auth.uid())
  from public.requests r
  left join public.stations  s on s.id   = r.station_id
  left join public.districts d on d.code = r.district_code
  where r.status = 'open'
    and public.current_user_role() = 'realtor'
    and exists (
      select 1 from public.realtor_service_areas sa
      where sa.realtor_id    = auth.uid()
        and sa.area_type     = 'district'
        and sa.district_code = r.district_code
    )
  order by r.created_at desc;
$$;


-- ========================================
-- 2. 단건: 응답 작성 화면 진입 (/realtor/respond/:id)
--    getRequestById()를 대체한다. 030 적용 후 그 함수는 중개사에게 0행을 반환하므로
--    교체하지 않으면 응답 작성 기능이 통째로 죽는다.
-- ========================================
create or replace function public.get_open_request_for_realtor(p_request_id uuid)
returns table (
  id                    uuid,
  station_name_ko       text,
  line_names            text[],
  district_name_ko      text,
  property_category     property_category,
  deal_type             deal_type,
  rent_max              integer,
  deposit_max           integer,
  deposit_min           integer,
  jeonse_loan_planned   boolean,
  room_types            room_type[],
  contract_months       integer,
  amenities             text[],
  extra_note            text,
  move_in_date          date,
  registration_required boolean,
  response_count        integer,
  created_at            timestamptz,
  my_response_count     integer
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    r.id, s.name_ko,
    (select array_agg(l.name_ko order by l.display_order)
       from public.station_lines sl
       join public.lines l on l.id = sl.line_id
      where sl.station_id = r.station_id),
    d.name_ko,
    r.property_category, r.deal_type,
    r.rent_max, r.deposit_max, r.deposit_min, r.jeonse_loan_planned,
    r.room_types, r.contract_months, r.amenities,
    r.extra_note, r.move_in_date, r.registration_required,
    r.response_count, r.created_at,
    (select count(*)::integer from public.properties p
      where p.request_id = r.id and p.realtor_id = auth.uid())
  from public.requests r
  left join public.stations  s on s.id   = r.station_id
  left join public.districts d on d.code = r.district_code
  where r.id = p_request_id
    and r.status = 'open'
    and public.current_user_role() = 'realtor'
    and exists (
      select 1 from public.realtor_service_areas sa
      where sa.realtor_id    = auth.uid()
        and sa.area_type     = 'district'
        and sa.district_code = r.district_code
    );
$$;


-- ========================================
-- 3. 이미 응답한 요청서 (열람 예외)
--
--    영업지역 조건을 걸지 않는다. 근거: 이미 제안을 보낸 요청서는 영업지역이 바뀌어도
--    계속 볼 수 있어야 한다. 열람 근거는 "영업지역"이 아니라 "내가 응답했다"는 사실이다.
--    status를 반환하는 것도 여기뿐이다 - 마감/만료 여부를 알아야 후속 대응을 한다.
--
--    무관한 중개사는 properties 조건에 걸리지 않으므로 closed/expired에 절대 닿지 못한다.
-- ========================================
create or replace function public.get_responded_request_for_realtor(p_request_id uuid)
returns table (
  id                    uuid,
  station_name_ko       text,
  line_names            text[],
  district_name_ko      text,
  status                request_status,
  property_category     property_category,
  deal_type             deal_type,
  rent_max              integer,
  deposit_max           integer,
  deposit_min           integer,
  jeonse_loan_planned   boolean,
  room_types            room_type[],
  contract_months       integer,
  amenities             text[],
  extra_note            text,
  move_in_date          date,
  registration_required boolean,
  response_count        integer,
  created_at            timestamptz,
  my_response_count     integer
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    r.id, s.name_ko,
    (select array_agg(l.name_ko order by l.display_order)
       from public.station_lines sl
       join public.lines l on l.id = sl.line_id
      where sl.station_id = r.station_id),
    d.name_ko,
    r.status,
    r.property_category, r.deal_type,
    r.rent_max, r.deposit_max, r.deposit_min, r.jeonse_loan_planned,
    r.room_types, r.contract_months, r.amenities,
    r.extra_note, r.move_in_date, r.registration_required,
    r.response_count, r.created_at,
    (select count(*)::integer from public.properties p
      where p.request_id = r.id and p.realtor_id = auth.uid())
  from public.requests r
  left join public.stations  s on s.id   = r.station_id
  left join public.districts d on d.code = r.district_code
  where r.id = p_request_id
    and public.current_user_role() = 'realtor'
    and exists (
      select 1 from public.properties p
      where p.request_id = r.id and p.realtor_id = auth.uid()
    );
$$;


-- ========================================
-- 4. "내가 보낸 응답" 탭
--
--    listMyPropertyResponses()를 대체한다. 기존 쿼리는 properties에 requests(region_text)를
--    임베디드 조인하는데, 030 적용 후 중개사는 requests를 읽을 수 없어 그 값이 null이 된다.
--    비정규화(properties에 지역명 스냅샷)를 늘리는 대신 RPC로 전환한다.
--
--    이미지는 get_public_listings()(migration_011)의 jsonb_agg 패턴을 그대로 따른다.
--    영업지역 조건 없음 - 내 응답은 언제나 내 것이다.
-- ========================================
create or replace function public.list_my_responses_for_realtor()
returns table (
  property_id        uuid,
  request_id         uuid,
  station_name_ko    text,
  district_name_ko   text,
  request_status     request_status,
  title              text,
  address            text,
  deposit            integer,
  monthly_rent       integer,
  room_type          room_type,
  created_at         timestamptz,
  property_images    jsonb
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    p.id, p.request_id, s.name_ko, d.name_ko, r.status,
    p.title, p.address, p.deposit, p.monthly_rent, p.room_type, p.created_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('image_url', pi.image_url, 'sort_order', pi.sort_order)
                        order by pi.sort_order)
         from public.property_images pi where pi.property_id = p.id),
      '[]'::jsonb
    )
  from public.properties p
  join public.requests r on r.id = p.request_id
  left join public.stations  s on s.id   = r.station_id
  left join public.districts d on d.code = r.district_code
  where p.realtor_id = auth.uid()
    and p.request_id is not null          -- 공개 매물은 이 목록에서 제외
    and public.current_user_role() = 'realtor'
  order by p.created_at desc;
$$;


-- ========================================
-- 5. 채팅 상대(고객) 식별
--
--    Chat.jsx는 requests를 읽지 않는다. requests에 닿는 채팅 경로는
--    getOrCreatePropertyChatRoom()이 고객 id를 알아내는 곳 하나뿐이다.
--
--    현재 코드(chat.api.js:16-23)는
--      properties.select('realtor_id, requests(customer_id)')  ->  ?? user.id
--    인데, 030 적용 후 중개사에게는 requests 조인이 null이 되어 폴백이 발동하고
--    "중개사가 자기 자신과 채팅방을 만드는" 조용한 실패가 생긴다.
--
--    이 함수는 그 판단을 서버로 옮긴다. 공개 매물(request_id is null)이면 호출자 본인이
--    고객이고, 요청서 응답 매물이면 그 요청서의 고객이다. 무관한 사람은 null을 받는다.
-- ========================================
create or replace function public.resolve_chat_customer_id(p_property_id uuid)
returns uuid
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select case
    when p.request_id is null then auth.uid()          -- 공개 매물: 문의자 본인이 고객
    when p.realtor_id = auth.uid()
      or r.customer_id = auth.uid()
      or r.created_by  = auth.uid() then r.customer_id -- 응답 매물: 당사자만
    else null
  end
  from public.properties p
  left join public.requests r on r.id = p.request_id
  where p.id = p_property_id;
$$;


-- ========================================
-- 6. 5개 제한 헬퍼 (031에서 properties_insert_realtor 정책이 쓴다)
--    정책 안에서 같은 테이블을 세야 하므로 SECURITY DEFINER로 RLS 재귀를 피한다.
--    migration_018의 is_pending_realtor_applicant()와 같은 패턴이다.
-- ========================================
create or replace function public.realtor_response_count(p_request_id uuid)
returns integer
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from public.properties
  where request_id = p_request_id and realtor_id = auth.uid();
$$;


-- ========================================
-- 권한: PUBLIC/anon 회수, authenticated에만 EXECUTE
-- ========================================
revoke all on function public.list_open_requests_for_realtor()            from public, anon;
revoke all on function public.get_open_request_for_realtor(uuid)          from public, anon;
revoke all on function public.get_responded_request_for_realtor(uuid)     from public, anon;
revoke all on function public.list_my_responses_for_realtor()             from public, anon;
revoke all on function public.resolve_chat_customer_id(uuid)              from public, anon;
revoke all on function public.realtor_response_count(uuid)                from public, anon;

grant execute on function public.list_open_requests_for_realtor()         to authenticated;
grant execute on function public.get_open_request_for_realtor(uuid)       to authenticated;
grant execute on function public.get_responded_request_for_realtor(uuid)  to authenticated;
grant execute on function public.list_my_responses_for_realtor()          to authenticated;
grant execute on function public.resolve_chat_customer_id(uuid)           to authenticated;
grant execute on function public.realtor_response_count(uuid)             to authenticated;


-- ========================================
-- 적용 후 확인 (030 전이므로 T1/T2는 아직 통과하지 않는다)
-- ========================================
-- T3  중개사 세션 -> rpc('list_open_requests_for_realtor')    영업지역 내 open만
-- T4  반환 row의 Object.keys()에 customer_id/created_by/location_lat/location_lng/
--     station_id/district_code/jeonse_loan_detail/region_text가 "없어야" 한다.
--     값이 null인 것으로 판단하지 말 것 - 키 자체가 없어야 한다
-- T5  영업지역 미설정 중개사 -> 0건
-- T6  다른 구 요청서 id -> get_open_request_for_realtor  -> 0행
-- T7  응답 이력 없는 중개사 + closed id -> 4개 함수 전부 0행
-- T8  응답 이력 있는 중개사 + 영업지역 변경 후 -> get_responded_request_for_realtor 조회됨
-- T9  고객 세션 -> list_open_requests_for_realtor  -> 0건(role 조건)
-- T10 anon -> 전 함수 권한 오류


-- ========================================
-- 롤백 (호출부가 없는 시점이면 무조건 안전)
-- ========================================
-- drop function if exists public.list_open_requests_for_realtor();
-- drop function if exists public.get_open_request_for_realtor(uuid);
-- drop function if exists public.get_responded_request_for_realtor(uuid);
-- drop function if exists public.list_my_responses_for_realtor();
-- drop function if exists public.resolve_chat_customer_id(uuid);
-- drop function if exists public.realtor_response_count(uuid);
