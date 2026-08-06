-- 마이그레이션 022: 관계 기반 프로필 조회 RPC (정책 변경 없음)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_021_deal_type_jeonse_fields.sql까지 먼저 실행되어 있어야 함
--
-- ============================================================================
-- 왜 정책을 건드리지 않는가
-- ============================================================================
--   profiles의 using(true)를 먼저 닫으면 현재 embedded join을 쓰는 화면이 즉시 깨진다.
--   그래서 023(잠금)과 분리해 무중단 순서를 만든다:
--
--     022 적용   -> 아무것도 안 깨짐. RPC와 기존 embedded join이 공존
--     프론트 배포 -> RPC로 전환
--     브라우저 검증 -> ResponseStatus / Chat 실제 확인
--     023 적용   -> using(true) 제거
--
--   각 단계가 독립적으로 롤백된다. 동시 배포가 필요한 지점이 없다.
--
-- ============================================================================
-- 왜 RPC인가 (관계 기반 SELECT 정책을 쓰지 않는 이유)
-- ============================================================================
--   RLS는 행 수준 보안이라 허용된 행의 "모든 컬럼"이 노출된다. PostgREST는 select=*를
--   그대로 통과시키므로, "채팅 상대의 프로필 행"을 허용하는 순간 그 행의 phone까지
--   조회된다. 화면이 nickname만 쓴다는 것은 방어가 아니다.
--
--   이것은 requests를 RPC로 옮긴 것과 동일한 논리다. 같은 원칙을 profiles에도 적용한다.
--   -> profiles 원본 SELECT는 023에서 본인(own) + admin 둘만 남기고,
--      관계 기반 조회는 아래 두 RPC가 최소 컬럼만 반환한다.
--
-- ============================================================================
-- 연락처 공개 방향은 비대칭이다 (나중에 대칭으로 단순화하지 말 것)
-- ============================================================================
--   중개사 -> 고객 연락처 : 차단. 예외 없음.
--       고객 연락처가 중개사 손에 들어가면 곧바로 영업 대상 명단이 된다.
--       두 RPC 어디에서도 phone을 반환하지 않으며, 023 이후 원본 SELECT 경로도 없다.
--
--   고객 -> 중개사 연락처 : 현재 반환하지 않음.
--       공개된 사업자 연락처라 성격이 다르지만, 지금은 열지 않는다.
--       향후 전화 문의 기능을 만들 때 별도 제품 정책과 공개 동의를 거쳐 추가한다.
--       "아직 안 여는 것"이지 "영구 금지"가 아니라는 점이 위 방향과 다르다.
--
-- ============================================================================
-- SECURITY DEFINER 안전 원칙
-- ============================================================================
--   - 호출자 판정은 auth.uid()로만 한다. participant_id / realtor_id를 인자로 받지 않는다
--   - set search_path = pg_catalog, public 고정
--   - 본문의 모든 테이블을 schema-qualified로 참조
--   - 동적 SQL 없음, stable(부작용 없음)
--   - PUBLIC/anon EXECUTE 회수, authenticated에만 EXECUTE
--     ([2-A] 조사에서 기존 함수 6개가 전부 PUBLIC EXECUTE 상태였다. 기본 권한에 의존하지 않는다)
--   - owner는 postgres(bypassrls)이므로 함수 본문이 유일한 방어선이다
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: 함수 2개 신규 / 파일: 이후 properties.api.js, chat.api.js, ResponseStatus.jsx, Chat.jsx
--   영향 받는 기능: 없음 - 이 시점에는 아무도 호출하지 않는다
--   영향 없음: 기존 정책 전부(profiles using(true) 그대로) / 모든 화면 / 인증 흐름


-- ========================================
-- 1. 고객이 받은 응답 목록 (부동산 표시명 포함)
--
--    listPropertiesForRequest()를 대체한다. 기존 쿼리는
--      properties.select('*, realtor:profiles(nickname), property_images(image_url, sort_order)')
--    로 profiles를 embedded join하는데, 023 이후에는 그 조인이 null이 된다.
--
--    표시명은 profiles.nickname을 쓴다.
--    근거: RealtorSignUp.jsx:60이 가입 시 nickname을 companyName으로 저장하므로
--    중개사의 nickname은 이미 업체명이다. 화면 표시가 지금과 완전히 동일해 회귀 위험이 0이다.
--    realtor_applications.company_name을 쓰지 않는 이유: 그 테이블은 사업자등록번호와
--    서류 경로가 있는 민감 테이블이라, 고객용 조회 함수가 참조하면 노출면이 넓어진다.
--    (nickname 위조 방지는 023의 prevent_realtor_nickname_change 트리거가 담당한다)
--
--    반환 컬럼 (11개) - 기존 ResponseStatus가 실제로 쓰는 필드 전부:
--      property_id, realtor_id, realtor_display_name, title, address, description,
--      deposit, monthly_rent, room_type, created_at, property_images
--
--    제외:
--      profiles 쪽 - phone, preferred_language, role, id 외 전 컬럼
--      properties 쪽 - request_id, is_public, lat, lng, listing_status, address_public
--      status(property_status) - 프론트 전수 grep 결과 참조 0건이라 넣지 않는다.
--        "선택됨" 배지가 필요해지면 그때 v2 함수로 추가한다
--
--    ★ 그룹핑 키는 realtor_display_name이 아니라 realtor_id다.
--      order by rp.nickname은 같은 사무소 행을 연속으로 오게 하는 정렬 용도일 뿐이고,
--      동명 사무소가 존재하면 이름으로 묶었을 때 섞인다.
--
--    [r.created_by = auth.uid() 조건을 넣는 근거 - 조사 결과]
--      이 조건은 새로운 권한 부여가 아니라 기존 동작의 보존이다. 확인한 사실:
--
--      1. 현재 created_by는 항상 customer_id와 같다.
--         createRequest()(requests.api.js:35)가 둘 다 user.id로 채우고, 에이전트가 남을
--         대신 작성하는 UI는 아직 없다(requests.api.js:8-9 주석에 "이후 단계" 명시).
--         따라서 이 조건은 오늘 기준으로 추가 권한을 한 건도 주지 않는다.
--
--      2. 기존 정책 4곳이 이미 같은 조건을 쓴다:
--         policies.sql:61 properties_select_related
--         policies.sql:79 properties_update_related
--         policies.sql:97 property_images_select_related
--         migration_009:47, migration_010:37
--         -> 이 조건을 빼면 RPC가 기존 properties_select_related보다 오히려 더 엄격해져
--            "조용한 동작 변경"이 된다. 넣는 쪽이 기존 계약 유지다.
--
--      3. care_agent role은 현재 전용 화면이 없다.
--         homePathForRole()과 RealtorRoute 모두 default로 /coming-soon에 보낸다.
--         MyPage가 "에이전트 계정" 라벨만 표시한다.
--
--      ★ 미확정(제품 결정 사항): 에이전트가 "작성만 대행"인지 "이후 응답 관리까지"인지.
--        README:19는 "고객을 대신해 조건 요청서 작성 가능"으로 작성만 언급하지만,
--        위 4개 정책은 이미 응답 열람까지 허용하고 있어 문서와 구조가 어긋나 있다.
--        대리 작성 기능을 실제로 만들 때 결정해야 하며, 그때 이 조건도 함께 재검토한다.
--        TODO_PHASE2.md "에이전트(care_agent) 권한 범위 미확정" 항목 참고.
--
--    property_images는 get_public_listings()(migration_011)의 jsonb_agg 패턴을 따른다.
--    기존 embedded join도 id를 가져오지 않았고(image_url, sort_order만), 빈 경우 []를
--    반환했으므로 coalesce(..., '[]'::jsonb)로 동작이 일치한다.
-- ========================================
create or replace function public.list_request_responses_for_customer(p_request_id uuid)
returns table (
  property_id          uuid,
  realtor_id           uuid,
  realtor_display_name text,
  title                text,
  address              text,
  description          text,
  deposit              integer,
  monthly_rent         integer,
  room_type            room_type,
  created_at           timestamptz,
  property_images      jsonb
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    p.id, p.realtor_id, rp.nickname,
    p.title, p.address, p.description,
    p.deposit, p.monthly_rent, p.room_type, p.created_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('image_url', pi.image_url, 'sort_order', pi.sort_order)
                        order by pi.sort_order)
         from public.property_images pi
        where pi.property_id = p.id),
      '[]'::jsonb
    )
  from public.properties p
  join public.requests  r  on r.id  = p.request_id
  join public.profiles  rp on rp.id = p.realtor_id
  where p.request_id = p_request_id
    and (r.customer_id = auth.uid() or r.created_by = auth.uid())   -- 서버에서 소유 검증
  order by rp.nickname, p.created_at desc;
$$;


-- ========================================
-- 2. 채팅 참여자 (최소 필드)
--
--    ROOM_WITH_PARTICIPANTS(chat.api.js:6)의 profiles embedded join을 대체한다.
--
--    ★ 호출자가 전달한 participant_id를 신뢰하지 않는다. 방 id만 받고,
--      auth.uid()가 그 방의 참여자인지 서버에서 확인한 뒤 두 참여자를 반환한다.
--      무관한 방 id를 넣으면 where 조건이 걸러 0행이다.
--
--    is_customer 플래그는 넣지 않는다. Chat.jsx:49가 이미
--      const isCustomer = room.customer_id === profile.id
--    로 스스로 계산하고 있고, chat_rooms는 계속 직접 조회하므로 그 값이 그대로 있다.
--    상대 선택은 participants.find(p => p.participant_id !== myProfile.id)로 충분하다.
--
--    chat_rooms 테이블 자체는 계속 직접 조회한다. 컬럼이
--    id/property_id/customer_id/realtor_id/created_at/*_last_read_at 뿐이라 민감 정보가 없고,
--    RLS가 이미 참여자로 제한하며, markChatRoomRead()의 UPDATE와 realtime 구독이
--    테이블 접근을 필요로 한다.
--
--    제외: phone, role, 그 외 profiles 전 컬럼
--         (이메일은 애초에 profiles에 없다 - auth.users 소관이며 접근 불가)
-- ========================================
create or replace function public.get_chat_participants(p_room_id uuid)
returns table (
  participant_id     uuid,
  nickname           text,
  preferred_language text
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select pr.id, pr.nickname, pr.preferred_language
  from public.chat_rooms cr
  join public.profiles pr on pr.id in (cr.customer_id, cr.realtor_id)
  where cr.id = p_room_id
    and (cr.customer_id = auth.uid() or cr.realtor_id = auth.uid());  -- 서버에서 참여 검증
$$;


-- ========================================
-- 권한: 기본 EXECUTE에 의존하지 않는다
-- ========================================
revoke all on function public.list_request_responses_for_customer(uuid) from public, anon;
revoke all on function public.get_chat_participants(uuid)               from public, anon;

grant execute on function public.list_request_responses_for_customer(uuid) to authenticated;
grant execute on function public.get_chat_participants(uuid)               to authenticated;


-- ========================================
-- 적용 후 확인 (023 전이므로 원본 SELECT는 아직 열려 있다)
-- ========================================
-- T27 anon -> 두 RPC 호출                  => 권한 거부(42501)
-- T28 authenticated 무관 사용자 -> 두 RPC   => 0행 (에러가 아니라 빈 결과)
-- T29 관계자 호출                          => 최소 허용 필드만
-- T30 ★ 반환 객체 Object.keys() 검사       => 'phone' 키 자체가 없어야 한다.
--     row.phone === null 로 판단하면 통과해도 의미가 없다.
--     예) Object.keys(rows[0]).includes('phone') === false
-- T21 무관한 p_room_id / p_request_id 투입  => 0행


-- ========================================
-- 롤백 (호출부가 없는 시점이면 무조건 안전)
-- ========================================
-- drop function if exists public.list_request_responses_for_customer(uuid);
-- drop function if exists public.get_chat_participants(uuid);
