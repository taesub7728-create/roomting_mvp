-- 마이그레이션 030: requests 열람 잠금 + properties 쓰기 영업지역 조건 + 함수 권한 위생
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_029_realtor_request_rpc.sql까지 먼저 실행되어 있어야 함
--
-- ★★ 적용 전제 3가지 - 하나라도 빠지면 기능이 죽거나 중개사가 0건을 본다 ★★
--
--   (1) 프론트가 이미 029의 RPC로 전환 배포되어 있어야 한다.
--       전환 전에 적용하면 중개사 화면 3곳(요청서 목록 / 응답 작성 / 내가 보낸 응답)이
--       즉시 죽는다. getRequestById()와 listMyPropertyResponses()가 0행이 되기 때문이다.
--
--   (2) admin 승인 UI가 028의 approve_realtor_application() RPC로 전환되어 있어야 하고,
--       구경로(approveRealtorApplication()의 .update({role}).select())는 코드에서
--       삭제되어 있어야 한다.
--       구경로로 승인된 중개사는 realtor_service_areas에 행이 없어 이 migration 적용
--       직후 요청서를 0건 보게 된다.
--       ※ 두 경로의 공존은 "028 적용 ~ admin UI 배포"의 1회 배포 사이클(1일 이내)로
--          제한한다. 장기 공존 금지.
--
--   (3) 기존 realtor 전원의 영업지역이 등록되어 있어야 한다.
--       적용 직전 아래 쿼리가 0행인지 반드시 확인할 것 (028 하단과 동일):
--         select p.id, p.nickname, ra.company_name, ra.company_address
--         from profiles p
--         left join realtor_service_areas sa on sa.realtor_id = p.id
--         left join realtor_applications ra on ra.profile_id = p.id
--         where p.role = 'realtor' and sa.id is null;
--
-- ============================================================================
-- 이 파일이 닫는 구멍
-- ============================================================================
--   기존 requests_select_own_or_realtor(policies.sql:31, migration_010에서 admin 추가)는
--   role='realtor'이기만 하면 조건 없이 전체 requests를 허용했다. 확인된 사실:
--     - status 조건이 RLS에 없다. open만 보이는 건 프론트 쿼리가 .eq('status','open')을
--       붙였기 때문이고, API를 직접 호출하면 closed/expired까지 전부 나온다
--     - 컬럼 제한이 없다. extra_note, customer_id가 그대로 나간다
--     - 얻은 customer_id로 profiles를 조인하면 전화번호에 닿는다(022/023에서 선행 차단됨)
--
--   즉 승인만 받으면 전국 모든 요청서를 통째로 덤프할 수 있는 상태였다.
--
-- ============================================================================
-- 보안 시나리오
-- ============================================================================
-- [1] 공격 가능 시나리오
--   A1 중개사가 GET /rest/v1/requests?select=*             -> 전국 덤프        => 0행
--   A2 A1의 customer_id로 GET /profiles?id=eq.<uuid>       -> 전화번호 획득    => 시작 불가
--   A4 RPC에 realtor_id 인자를 조작해 남의 영업지역 조회                        => 인자가 없어 불가
--   A5 중개사가 realtor_service_areas에 25개 구 직접 INSERT                     => 027 RLS로 차단
--   A6 영업지역 밖 요청서 id로 properties INSERT           -> 통과했음        => 아래 3번으로 차단
--   A7 anon이 current_user_role() 호출                     -> 항상 null(무해)  => 호출 자체 차단
--   A8 public 스키마에 악성 함수를 심어 search_path 가로채기 -> can_create_in_public=false로
--      이미 불가. 아래 4번은 명시적 방어(defense in depth)이지 취약점 수정이 아니다
--   A9 중개사가 관계(채팅/응답)를 근거로 고객 profiles 원본을 조회해 phone 획득
--      -> 023에서 관계 기반 SELECT 정책을 아예 만들지 않았으므로 차단.
--         관계 기반 조회는 022의 RPC가 최소 컬럼만 반환한다
--
-- [2] 정상 사용자 흐름
--   고객   요청서 작성 -> ResponseStatus에서 응답 확인(부동산 이름 보임) -> 채팅
--   중개사 대시보드에서 자기 영업지역 open 요청만 -> 응답(최대 5개) -> 채팅
--   admin  요청서/지원서/프로필 전체 조회, 승인, 영업지역 지정
--
-- [3] 차단되어야 하는 요청
--   중개사 -> requests 테이블 직접 select                  (아래 1번)
--   중개사 -> 영업지역 밖 요청서 (RPC 경유 포함)            (029 본문 + 아래 3번)
--   중개사 -> 무관한 요청서의 closed/expired               (RPC 4종 어디에도 미해당)
--   중개사 -> 무관한 고객 프로필                            (023)
--   고객   -> 남의 요청서                                   (아래 1번, 기존 유지)
--   중개사 -> 자기 영업지역 추가                            (027)
--   anon   -> 모든 중개사용 RPC                             (029 grant)
--
-- [4] 허용되어야 하는 요청
--   중개사 -> 자기 영업지역 open 요청
--   중개사 -> 이미 응답한 요청 (영업지역 변경 후에도, closed여도)
--   중개사 -> 채팅 상대 고객 프로필
--   고객   -> 응답한 중개사 프로필 (채팅 시작 전에도)
--   admin  -> 전부
--   고객   -> 본인 요청서 전 컬럼
--
-- [5] 테스트 방법: 파일 하단 참고. 테스트 계정
--   customer taesub7728+test1@gmail.com / realtor taesub7728+test2@gmail.com
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: requests SELECT 정책 / properties INSERT 정책 / 기존 함수 6개 권한·config
--   영향 받는 기능: 중개사 요청서 열람 범위(전국 -> 영업지역), properties INSERT
--   영향 없음: 고객 요청서 작성·조회(정책 유지) / 채팅 메시지(정책 무변경) /
--             지도 탐색(get_public_listings는 SECURITY DEFINER라 무관) /
--             매물 사진(정책 무변경) / requests INSERT·UPDATE 정책(무변경)
--   개인정보: 신규 저장 없음. 노출 범위만 축소


-- ========================================
-- 1. requests SELECT: realtor 분기 제거
--
--    이 순간부터 중개사의 requests 직접 조회는 0행이다.
--    열람은 오직 029의 RPC를 통해서만 이뤄진다.
--    care_agent는 기존에도 이 정책에 없었고 created_by로만 접근한다(변화 없음).
-- ========================================
drop policy if exists "requests_select_own_or_realtor" on requests;

create policy "requests_select_own_or_admin" on requests
  for select to authenticated
  using (
    created_by  = auth.uid()
    or customer_id = auth.uid()
    or public.current_user_role() = 'admin'
  );


-- ========================================
-- 2. (자리 표시) requests INSERT/UPDATE 정책은 변경하지 않는다
--    migration_018의 requests_insert_own(심사 대기자 차단 포함)과
--    migration_010의 requests_update_own을 그대로 둔다.
--    027의 파생 트리거가 INSERT 경로를 바꾸지 않으므로 Phase 2의
--    classifySubmitFailure() 에러 분류도 그대로 유효하다.
-- ========================================


-- ========================================
-- 3. properties INSERT: 영업지역 조건 추가
--
--    열람을 막고 쓰기를 안 막으면 일관성이 없다. 요청서 id를 알아낸 경우(UUID라
--    추측은 사실상 불가하지만, 과거에 열람했던 id를 보관한 경우 등) 영업지역 밖
--    요청서에 응답을 밀어 넣을 수 있다.
--
--    request_id is null(공개 매물)은 영업지역과 무관하므로 그대로 통과시킨다.
--    5개 제한은 031에서 이 정책을 다시 써서 추가한다.
-- ========================================
drop policy if exists "properties_insert_realtor" on properties;

create policy "properties_insert_realtor" on properties
  for insert to authenticated
  with check (
    realtor_id = auth.uid()
    and public.current_user_role() = 'realtor'
    and (
      request_id is null                      -- 공개 매물(지도)은 영업지역 무관
      or exists (
        select 1
        from public.requests r
        join public.realtor_service_areas sa
          on sa.district_code = r.district_code
        where r.id = properties.request_id
          and sa.realtor_id = auth.uid()
          and sa.area_type  = 'district'
      )
    )
  );


-- ========================================
-- 4. 기존 함수 6개 권한 위생 + search_path 명시
--
--    [2-A] 조사 결과 6개 함수 전부 acl에 '=X/postgres'(PUBLIC EXECUTE)가 있었다.
--    Postgres가 함수 생성 시 기본 부여하는 것이다.
--
--    실제 위험도:
--      current_user_role / is_pending_realtor_applicant
--        -> anon은 auth.uid()가 null이라 구조적으로 아무것도 반환하지 않는다. 위험 0.
--           위생 차원에서 회수한다.
--      handle_new_user / increment_response_count
--        -> returns trigger라 직접 호출이 불가능하다(에러). 위험 0.
--           ★ 트리거 실행은 CREATE TRIGGER 시점에 권한을 검사하므로 회수해도 동작해야
--             하지만, 틀리면 회원가입이 통째로 죽는다. 아래 T16으로 반드시 확인할 것.
--             실패하면 이 두 줄만 되돌린다.
--      check_landline_duplicate  -> 의도된 anon(가입 전 호출). 유지한다.
--      get_public_listings       -> 의도된 anon(migration_019). 유지한다.
--
--    search_path 강화에 대한 정확한 사실:
--      pg_catalog는 명시하지 않아도 항상 먼저 검색되므로, 현재의 search_path=public도
--      pg_catalog 가로채기에는 이미 안전하다. 게다가 authenticated/anon 모두 public
--      스키마에 CREATE 권한이 없어(2-B) 우회 경로 자체가 막혀 있다.
--      따라서 이 변경은 기능적 수정이 아니라 명시화이고, 신규 함수(026~028)와 표기를
--      맞추기 위한 것이다. 메타데이터만 바뀌며 재컴파일도 락도 없다.
--
--    6개 함수 본문을 전부 검토했고, public과 pg_catalog 밖의 스키마에 의존하는 식별자는
--    하나도 없다(auth.uid()는 이미 schema-qualified).
-- ========================================

-- 4-1. 위험 0이지만 회수 (호출 주체가 authenticated뿐)
revoke all on function public.current_user_role()              from public, anon;
revoke all on function public.is_pending_realtor_applicant()   from public, anon;
grant execute on function public.current_user_role()           to authenticated;
grant execute on function public.is_pending_realtor_applicant() to authenticated;

-- 4-2. 트리거 전용 함수 - T16 확인 후 유지 여부 확정
revoke all on function public.handle_new_user()                from public, anon, authenticated;
revoke all on function public.increment_response_count()       from public, anon, authenticated;

-- 4-3. 의도된 anon 접근은 유지 (회수하지 않는다)
--      check_landline_duplicate(text), get_public_listings()

-- 4-4. search_path 명시화 (6개 전부)
alter function public.current_user_role()                set search_path = pg_catalog, public;
alter function public.is_pending_realtor_applicant()     set search_path = pg_catalog, public;
alter function public.check_landline_duplicate(text)     set search_path = pg_catalog, public;
alter function public.get_public_listings()              set search_path = pg_catalog, public;
alter function public.handle_new_user()                  set search_path = pg_catalog, public;
alter function public.increment_response_count()         set search_path = pg_catalog, public;


-- ========================================
-- 테스트 (보안 시나리오 [5])
-- ========================================
-- T1  중개사 -> from('requests').select('*')                        => 0행
-- T2  중개사 -> from('requests').select('*').eq('status','closed')  => 0행
-- T3  중개사 -> rpc('list_open_requests_for_realtor')               => 영업지역 내 open만
-- T4  T3 반환 row의 Object.keys()에 제외 컬럼 10종이 없음 (값 null이 아니라 키 부재)
-- T5  영업지역 미설정 중개사 -> T3                                   => 0건
-- T6  다른 구 요청서 id -> get_open_request_for_realtor              => 0행
-- T7  응답 이력 없는 중개사 + closed id -> RPC 4종                    => 0행
-- T8  응답 이력 있는 중개사 + 영업지역 변경 후 -> get_responded_...   => 조회됨(status 포함)
-- T9  고객 -> list_open_requests_for_realtor                        => 0건
-- T10 anon -> 중개사용 RPC 전부                                      => 권한 오류
-- T11 중개사 -> 영업지역 밖 요청서에 properties INSERT               => RLS 거부
-- T12 중개사 -> 남의 realtor_service_areas INSERT/UPDATE            => RLS 거부
-- T14 중개사 -> 채팅 진입 시 resolve_chat_customer_id로 고객이 정해짐
--     자기 자신과의 방이 생기지 않는지 확인.
--     (닉네임/번역 언어 표시 자체는 023의 T23 소관)
-- T15 admin -> AdminDashboard 요청서 목록에 고객 닉네임 표시 (023 회귀)
-- T16 ★ 회원가입 1회 + 매물 응답 1회 정상 동작 (4-2 revoke 검증)


-- ========================================
-- 롤백
-- ========================================
-- drop policy if exists "requests_select_own_or_admin" on requests;
-- create policy "requests_select_own_or_realtor" on requests
--   for select to authenticated
--   using (created_by = auth.uid() or customer_id = auth.uid()
--       or public.current_user_role() = 'realtor'
--       or public.current_user_role() = 'admin');
--
-- drop policy if exists "properties_insert_realtor" on properties;
-- create policy "properties_insert_realtor" on properties
--   for insert to authenticated
--   with check (realtor_id = auth.uid() and public.current_user_role() = 'realtor');
--
-- grant execute on function public.current_user_role()            to public, anon;
-- grant execute on function public.is_pending_realtor_applicant() to public, anon;
-- grant execute on function public.handle_new_user()              to public, anon, authenticated;
-- grant execute on function public.increment_response_count()     to public, anon, authenticated;
-- alter function public.current_user_role()            set search_path = public;
-- alter function public.is_pending_realtor_applicant() set search_path = public;
-- alter function public.check_landline_duplicate(text) set search_path = public;
-- alter function public.get_public_listings()          set search_path = public;
-- alter function public.handle_new_user()              set search_path = public;
-- alter function public.increment_response_count()     set search_path = public;
--
-- 029의 RPC는 그대로 둔다. 롤백해도 프론트가 계속 동작한다.
