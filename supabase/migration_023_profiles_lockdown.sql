-- 마이그레이션 023: profiles 원본 SELECT 잠금 + 중개사 표시명 무결성
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_022_profiles_relation_rpc.sql까지 먼저 실행되어 있어야 함
--       ★ 그리고 프론트가 이미 022의 RPC로 전환 배포되고 브라우저 검증까지 끝나 있어야 한다.
--         전환 전에 적용하면 ResponseStatus와 Chat이 조용히 열화된다(아래 참고).
--
-- ============================================================================
-- 배경
-- ============================================================================
--   policies.sql:19의 profiles_select_authenticated는 using(true)라서, 로그인한 사람이면
--   누구나 전체 사용자의 nickname/phone/preferred_language를 조회할 수 있었다.
--   승인된 중개사 계정 하나로 전 고객의 전화번호를 수집하는 것이 가능한 상태다.
--
--   관계 기반 정책(예: "채팅 상대의 행은 허용")을 만드는 방식은 채택하지 않았다.
--   RLS는 행만 제한하고 컬럼은 숨기지 못하므로, 행이 허용되는 순간 phone까지 나간다.
--   화면이 nickname만 쓴다는 것은 방어가 아니다. -> 관계 기반 조회는 022의 RPC가 담당한다.
--
-- ============================================================================
-- profiles를 읽는 경로 전수 확인 (8곳)
-- ============================================================================
--   1. auth.api.js:88  getCurrentProfile()          본인 (.eq('id', user.id))     -> 정책 1
--   2. auth.api.js:39  updateOwnProfile().select()  본인                          -> 정책 1
--      auth.api.js:56  updatePreferredLanguage()    본인(UPDATE만)                -> 정책 1
--   3. requests.api.js:100 listAllRequests()        admin - 고객 nickname         -> 정책 2
--   4. realtorApplication.api.js:90                 admin - 신청자 role           -> 정책 2
--   5. realtorApplication.api.js:107 approve...     admin - UPDATE + .select()    -> 정책 2
--   6. properties.api.js:94 listAllPublicListings   admin - 중개사 nickname       -> 정책 2
--   7. properties.api.js:178 listPropertiesFor...   고객 -> 응답 중개사            -> 022 RPC로 이전
--   8. chat.api.js:6 ROOM_WITH_PARTICIPANTS         채팅 양쪽                     -> 022 RPC로 이전
--
--   PropertyDetail.jsx는 profiles를 읽지 않는다. MapExplore는 get_public_listings() RPC
--   경유라 profiles 조인이 없다. 따라서 원본 SELECT는 아래 2개로 충분하다.
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: profiles SELECT 정책 + 트리거 1개 신규
--             (UPDATE 정책 profiles_update_own(migration_015)은 그대로 둔다)
--   영향 받는 기능: 경로 7, 8 - 022 RPC로 이미 전환되어 있어야 함
--   영향 없음: requests/properties/chat_messages 정책(무변경) / 인증 흐름(무변경) /
--             지도 탐색(get_public_listings는 SECURITY DEFINER라 무관) /
--             중개사 언어 변경(아래 트리거가 nickname만 검사)
--   개인정보: 신규 저장 없음. 노출 범위만 축소


-- ========================================
-- 1. 전면 허용 정책 제거 -> 본인 + admin 둘만
-- ========================================
drop policy if exists "profiles_select_authenticated" on profiles;

-- 본인 (경로 1, 2)
-- 화면: AuthProvider(앱 전역), MyPage, MapExplore, 언어 변경, SignUp 닉네임 확정
-- .update().select()가 0행을 반환하지 않으려면 이 정책이 반드시 필요하다.
create policy "profiles_select_own" on profiles
  for select to authenticated
  using (id = auth.uid());

-- admin 전체 (경로 3, 4, 5, 6)
-- 화면: AdminDashboard의 요청서 목록 / 지원서 목록 / 공개 매물 목록 / 승인 버튼
-- approveRealtorApplication()은 남의 행을 UPDATE한 뒤 .select()로 되읽으므로
-- UPDATE 정책(migration_015)만으로는 부족하고 이 SELECT 정책이 함께 필요하다.
create policy "profiles_select_admin" on profiles
  for select to authenticated
  using (public.current_user_role() = 'admin');


-- ========================================
-- 2. 중개사 공개 표시명 무결성
--
--    [문제] 022의 list_request_responses_for_customer()가 profiles.nickname을
--    "공개 사무소명"으로 고객에게 노출하면서 이 값의 성격이 달라진다.
--    지금까지 nickname은 고객에게 표시되지 않았다.
--    승인된 중개사가 updateOwnProfile()로 이렇게 바꿀 수 있다:
--       A공인중개사 -> 직방공인중개사
--       A공인중개사 -> OO대학교 공식 제휴 부동산
--    이건 UI 한계가 아니라 사무소 사칭이다.
--
--    [왜 RLS 정책이 아닌 트리거인가]
--    UPDATE 정책에서 USING은 OLD 행, WITH CHECK은 NEW 행을 본다. 두 값을 비교할 수 없어
--    "nickname만 막고 preferred_language는 연다"를 정책으로 표현할 방법이 없다.
--    컬럼 단위 GRANT도 부적합하다 - role 구분이 안 되어 고객까지 묶이고,
--    admin의 .update({role}) 승인 경로가 막힌다.
--
--    이 코드베이스에는 이미 같은 형태가 있다: migration_016의 prevent_self_role_change()가
--    BEFORE UPDATE에서 OLD.role과 NEW.role을 비교해 예외를 던진다. 새 패턴이 아니라
--    같은 테이블에 있는 기존 패턴의 확장이다.
--
--    [왜 별도 컬럼(realtor_public_name)이 아닌가]
--    별도 컬럼을 만들어도 profiles_update_own이 모든 컬럼 UPDATE를 허용하므로 중개사가
--    그 컬럼을 직접 고칠 수 있다. 막으려면 결국 같은 트리거가 필요하다.
--    즉 "컬럼 + 백필 + approve RPC 확장 + 트리거"가 되어 순수하게 더 비싸다.
--
--    [조건 설계: current_user_role() <> 'admin'이 아니라 auth.uid() = old.id]
--    이 트리거의 목적은 "승인된 중개사가 자기 사무소명을 바꾸는 것"을 막는 것이다.
--    호출자의 role을 해석하는 것보다 수정 대상과 호출자의 관계를 직접 보는 편이
--    의도에 부합하고, 나중에 SECURITY DEFINER 함수가 끼어들어도 판정이 흔들리지 않는다
--    (auth.uid()는 요청 JWT의 claim이라 SECURITY DEFINER 안에서도 원래 호출자를 유지한다).
--
--    조건별 성립 확인:
--      본인 realtor의 nickname 변경    -> old.role='realtor', auth.uid()=old.id  => 차단
--      admin이 타인 profile 변경        -> auth.uid() <> old.id                  => 허용
--      SQL Editor (auth.uid() null)     -> null = old.id 는 NULL, AND 통과 못 함  => 허용
--      승인 트랜잭션(customer->realtor) -> old.role='customer'                    => 허용
--      preferred_language 변경          -> nickname 동일, 첫 조건 false           => 허용
--      admin 본인 nickname 변경         -> old.role='admin'                       => 허용
--
--    [알려진 한계 2가지]
--      (a) 승인 "전"에 바꿔둔 값은 고정된다. admin이 승인 화면에서 업체명/등록증을 보고
--          있으므로 그 시점에 걸러지고, 이상하면 admin이 나중에 고칠 수 있다.
--      (b) 제3자가 남의 nickname을 바꾸는 경우는 이 트리거가 막지 않는다.
--          profiles_update_own(auth.uid()=id 또는 admin)이 이미 막고 있으므로
--          실질 취약점은 없지만, 방어가 두 겹에서 한 겹으로 줄어든다는 점은 기록해 둔다.
--
--    [기존 트리거와의 실행 순서]
--      PostgreSQL은 같은 시점 트리거를 이름 알파벳순으로 실행한다.
--        trg_prevent_realtor_nickname_change  ('r')  <-- 먼저
--        trg_prevent_self_role_change         ('s')
--      순서는 결과에 영향을 주지 않는다. 두 트리거 모두 NEW를 수정하지 않고 서로 다른
--      컬럼(nickname vs role)만 검사하며 위반 시 예외만 던진다. 어느 쪽이 먼저든
--      "둘 다 통과해야 UPDATE 성립"이라는 결과가 같다. 유일한 차이는 두 규칙을 동시에
--      위반하는 UPDATE에서 어떤 에러 메시지가 먼저 나오는지뿐이다.
-- ========================================
create or replace function public.prevent_realtor_nickname_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.nickname is distinct from old.nickname
     and old.role = 'realtor'
     and auth.uid() = old.id then
    raise exception '승인된 중개사의 사무소명은 관리자만 변경할 수 있습니다.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_realtor_nickname_change on public.profiles;
create trigger trg_prevent_realtor_nickname_change
  before update on public.profiles
  for each row execute function public.prevent_realtor_nickname_change();

-- 트리거 전용 함수라 사용자가 직접 호출할 필요가 없다. 기본 PUBLIC EXECUTE를 회수한다.
-- ([2-A] 조사에서 기존 SECURITY DEFINER 함수 6개가 전부 PUBLIC EXECUTE 상태였다)
--
-- ★ PostgreSQL은 트리거 실행 시 함수 EXECUTE 권한을 재검사하지 않고 CREATE TRIGGER
--   시점에 검사한다고 알려져 있지만, 검증 없이 확정하지 않는다. 틀리면 profiles UPDATE가
--   전부 막혀 언어 변경과 승인까지 죽는다.
--   아래 T31~T34를 반드시 실제로 돌려 확인하고, 실패하면 이 revoke 한 줄만 되돌린다.
revoke all on function public.prevent_realtor_nickname_change() from public, anon, authenticated;


-- ========================================
-- 적용 전 확인: 023 이후 구버전 번들 탭에서 벌어지는 일
--
--   PostgREST의 embedded join은 RLS로 행이 걸러지면 "에러가 아니라 null"을 반환한다.
--   따라서 구버전 탭은 에러 없이 조용히 열화된다:
--
--     ResponseStatus  line 155  {p.realtor?.nickname || '공인중개사'}
--                     -> 정상 렌더. 이름만 "공인중개사"로 대체 (우아한 열화)
--     Chat            line 51   setOtherProfile(isCustomer ? room.realtor : room.customer) -> null
--                     line 119  otherProfile?.nickname || t.defaultTitle  -> 기본 제목
--                     line 92   if (... || !otherProfile) return
--                     -> ★ 메시지 전송이 조용히 무시된다. 크래시가 아니라 무반응이라
--                        사용자가 새로고침할 이유조차 알 수 없다.
--
--   대응:
--     (a) 사용량 최저 시간대에 적용한다 (실사용자가 사실상 없는 단계라 실효성이 크다)
--     (b) 프론트 전환 시 Chat.jsx에 방어를 넣는다 - otherProfile이 null이면 입력창 비활성 +
--         "연결이 오래됐어요. 새로고침해 주세요" 안내(4개 언어).
--         구버전 탭은 못 구하지만 다음에 같은 상황이 와도 조용히 죽지 않는다.
--     (c) 버전 배너(/version.json 폴링)는 이번 범위 밖. TODO_PHASE2.md 기록.
--
--   ★ Capacitor 앱이 나오면 새로고침으로 해결되지 않는다. 구버전 앱이 몇 주 남을 수 있어
--     DB 정책을 즉시 잠글 수 없다. 강제 업데이트 게이트 또는 API 버저닝이 선행되어야 한다.
--     TODO_PHASE2.md에 기록한다.
-- ========================================


-- ========================================
-- 테스트
-- ========================================
-- [보안]
-- T17 중개사 세션 -> GET /profiles?select=*            => 본인 1행. 고객 phone 포함 행 0건
-- T18 채팅방이 열린 상태에서 상대 고객 profiles 직접 조회 => 0행
-- T19 응답 관계가 있어도 고객 profiles 직접 조회         => 0행
-- T20 022 RPC 2개 반환 키 검사                          => 'phone' 키 자체 부재
-- T21 무관한 p_room_id / p_request_id                   => 0행
-- [트리거 - revoke 후에도 발동하는지 반드시 실제 확인]
-- T31 승인된 realtor 본인이 nickname 변경 시도            => 42501 예외 (트리거 발동 확인)
-- T32 admin이 그 realtor의 nickname 변경                  => 성공
-- T33 승인된 realtor가 preferred_language 변경            => 성공 (언어 전환 정상)
-- T34 customer -> realtor 승인 트랜잭션                    => 성공
--     ★ 반드시 "아직 승인되지 않은" 전용 계정(test3)으로 확인한다.
--       test2는 관계 데이터(응답/채팅) 생성을 위해 023 적용 전에 이미 승인되므로
--       같은 계정으로는 승인 트랜잭션을 다시 검증할 수 없다.
--       test2를 customer로 되돌렸다 재승인하는 방식은 쓰지 않는다 -
--       prevent_self_role_change(migration_016)를 건드리게 되고 실제 운영 상태와도 다르다.
--     ★ 승인 경로는 그 시점에 실제 배포된 것을 쓴다.
--       028 적용 전이면 구경로(approveRealtorApplication의 .update({role}).select()),
--       admin UI 전환 후면 approve_realtor_application() RPC.
-- ※ T31이 예외 없이 통과하면 트리거가 죽은 것이다. revoke를 되돌리고 재확인할 것.
--   T33/T34가 실패하면 revoke가 profiles UPDATE 전체를 막은 것이다. 즉시 되돌린다.
--
-- [정상 기능]
-- T22 고객 ResponseStatus에서 중개사 표시명 정상
-- T23 Chat에서 상대 nickname / preferred_language 정상 (번역이 동작해야 확인됨)
-- T24 admin 전체 profile 조회 정상 (AdminDashboard 3개 탭)
-- T25 본인 profile 조회 + update().select() 정상
-- T26 ★ 배포 시점에 실제로 쓰이는 중개사 승인 경로 정상
--     - 028 적용 전이면 구경로(approveRealtorApplication의 .update().select())
--     - admin UI 전환 후면 approve_realtor_application() RPC
--     둘 중 무엇이 배포돼 있는지 먼저 확인하고 그에 맞춰 테스트한다


-- ========================================
-- 롤백
-- ========================================
-- revoke 되돌리기: grant execute on function public.prevent_realtor_nickname_change() to public, anon, authenticated;
-- drop trigger if exists trg_prevent_realtor_nickname_change on public.profiles;
-- drop function if exists public.prevent_realtor_nickname_change();
-- drop policy if exists "profiles_select_own" on profiles;
-- drop policy if exists "profiles_select_admin" on profiles;
-- create policy "profiles_select_authenticated" on profiles
--   for select to authenticated
--   using (true);
--
-- 022의 RPC는 그대로 둔다. 롤백해도 프론트가 계속 동작한다.
