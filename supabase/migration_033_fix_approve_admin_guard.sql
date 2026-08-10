-- 마이그레이션 033: approve_realtor_application() 의 admin 가드 NULL-safe 수정
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_028_realtor_service_areas.sql 까지 적용되어 있어야 함
-- 주의: migration_028 파일 자체는 수정하지 않음. 이 파일이 해당 함수를 다시 CREATE OR REPLACE 함
--       (migration_017 이 migration_016 의 같은 성격 버그를 고친 방식과 동일하다)
--
-- ============================================================================
-- 버그 원인
-- ============================================================================
--   migration_028:128 의 가드는 이렇게 되어 있다.
--     if public.current_user_role() <> 'admin' then
--       raise exception 'admin only' using errcode = '42501';
--
--   public.current_user_role() 은 `select role from profiles where id = auth.uid()` 라서
--   해당 profiles 행이 없으면 **NULL** 을 반환한다(policies.sql:6-14).
--   SQL 3값 논리에서 NULL <> 'admin' 은 TRUE 가 아니라 **NULL** 이고,
--   PL/pgSQL 의 IF 는 **NULL 을 false 로 취급**한다.
--   -> 가드가 발동하지 않고 그대로 통과한다(fail-open).
--
--   도달 경로: 이 함수는 authenticated 에게 EXECUTE 가 부여되어 있다. 따라서 로그인은
--   되었으나 profiles 행이 없는 상태의 사용자가 호출하면 admin 이 아니어도 통과해,
--   임의의 p_profile_id 를 realtor 로 승격시키고 영업지역까지 부여할 수 있다.
--   anon 은 revoke 로 막혀 있다.
--
-- ============================================================================
-- 수정 내용과 근거 (migration_016 / 017 선례)
-- ============================================================================
--   if coalesce(public.current_user_role()::text, '') <> 'admin' then
--
--   ::text 캐스트가 필요한 이유:
--     current_user_role() 의 반환 타입은 text 가 아니라 user_role enum 이다
--     (schema.sql:10 create type user_role as enum (...)).
--     migration_016 은 coalesce(public.current_user_role(), '') 로 썼다가,
--     Postgres 가 ''(text 리터럴)를 첫 인자 타입(user_role)에 맞추려다
--     "invalid input value for enum user_role: ''" 런타임 오류를 냈다.
--     migration_017 이 ::text 를 넣어 그 버그를 고쳤고, 이 파일은 017 의 형태를 그대로 쓴다.
--
--   IS DISTINCT FROM 도 기술적으로 유효하지만 이 저장소에 선례가 없다.
--   보안 가드에 새 관용구를 도입하는 것보다 이미 검증된 형태를 반복한다.
--
--   의미: admin 만 통과. customer / realtor / care_agent / NULL 은 전부 42501.
--
-- ============================================================================
-- 적용 순서 - ★ 번호 순서와 다르다
-- ============================================================================
--   운영 적용 순서는 **029 이후 / 030 이전**이다. 파일 번호(033)는 030~032 보다 뒤지만
--   그것들보다 먼저 적용한다.
--
--   그래도 안전한 근거(적용 시점에 실측 확인):
--     - 030 / 031 / 032 중 approve_realtor_application 을 CREATE OR REPLACE 하는 곳이 없다
--       (030:11 에 주석 언급만 있고, 031/032 는 매칭 0건)
--     - 030 의 함수 권한 재고정 대상은 current_user_role / is_pending_realtor_applicant /
--       handle_new_user / increment_response_count 4개뿐이라 이 함수의 GRANT 를 덮지 않는다
--       (migration_029:108-109 가 같은 내용을 명시한다)
--     - 부정형 current_user_role() 가드는 저장소 전체에서 028:128 하나뿐이었다
--   -> 033 을 먼저 적용해도 후속 migration 이 이 수정을 덮어쓰지 않는다.
--
-- ============================================================================
-- 영향 범위
-- ============================================================================
--   변경 대상: 함수 1개(public.approve_realtor_application) 본문 한 줄 + 권한 재고정
--             / 파일: 없음 / API: 없음 (호출 시그니처 불변) / 사용자 흐름: 없음
--   영향 받는 기능: admin 승인 - 정상 admin 은 동작이 같고, profiles 행이 없는 호출자만
--                 통과하던 것이 42501 로 막힌다
--   영향 없음: 테이블 / 정책 / 인덱스 / 트리거 / 다른 함수 전부. DML 0건
--
-- ============================================================================
-- 적용 전 확인 (★ 먼저 실행할 것)
-- ============================================================================
--   DB 의 현재 함수 본문이 migration_028 과 같은지 먼저 확인한다.
--   CREATE OR REPLACE 는 기존 정의를 덮어쓰므로, 누군가 SQL Editor 에서 수동 수정해 둔
--   내용이 있다면 그것이 사라진다.
--
--     select pg_get_functiondef(
--       'public.approve_realtor_application(uuid,text[])'::regprocedure
--     );
--
--   기대: 아래 본문과 비교했을 때 차이가 가드 한 줄뿐이어야 한다.
--   그 외 차이가 하나라도 있으면 이 파일을 적용하지 말고 원인을 먼저 확인할 것.


create or replace function public.approve_realtor_application(
  p_profile_id     uuid,
  p_district_codes text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_district_codes is null or array_length(p_district_codes, 1) is null then
    raise exception 'at least one service area is required'
      using errcode = '23514';
  end if;

  update public.profiles set role = 'realtor' where id = p_profile_id;
  if not found then
    raise exception 'profile not found: %', p_profile_id using errcode = '23503';
  end if;

  insert into public.realtor_service_areas (realtor_id, area_type, district_code)
  select p_profile_id, 'district', code
  from unnest(p_district_codes) as code
  on conflict (realtor_id, area_type, district_code) do nothing;
end;
$$;

revoke all on function public.approve_realtor_application(uuid, text[]) from public, anon;
grant execute on function public.approve_realtor_application(uuid, text[]) to authenticated;

-- ========================================
-- 적용 후 확인 (read-only)
-- ========================================
-- 1. 가드가 NULL-safe 형태로 들어갔는지
--   select pg_get_functiondef(
--     'public.approve_realtor_application(uuid,text[])'::regprocedure
--   );
--
-- 2. 권한 (기대: PUBLIC 없음 / anon 없음 / authenticated 있음)
--   select coalesce(nullif(a.grantee, ''), 'PUBLIC') as grantee, a.privilege_type
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
--   cross join lateral (
--     select case when acl.grantee = 0 then '' else pg_get_userbyid(acl.grantee) end as grantee,
--            acl.privilege_type
--   ) a
--   where n.nspname = 'public' and p.proname = 'approve_realtor_application'
--   order by 1;


-- ========================================
-- 롤백 (비권장 - 롤백하면 fail-open 상태로 되돌아간다)
-- ========================================
-- create or replace function public.approve_realtor_application(
--   p_profile_id     uuid,
--   p_district_codes text[]
-- )
-- returns void
-- language plpgsql
-- security definer
-- set search_path = pg_catalog, public
-- as $$
-- begin
--   if public.current_user_role() <> 'admin' then
--     raise exception 'admin only' using errcode = '42501';
--   end if;
--   ... (migration_028:118-147 원문)
-- end;
-- $$;
