-- 마이그레이션 016: 신규 가입자 role 위조 차단 + profiles.role self-escalation 차단 (MVP 최소 방어)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_015_admin_approve_realtor.sql까지 먼저 실행되어 있어야 함
--
-- 이번 마이그레이션의 범위:
--   - RLS 정책은 변경하지 않음 (기존 policies.sql, migration_009~015의 정책 그대로 유지)
--   - 컬럼 단위 REVOKE/GRANT, admin_set_user_role() RPC는 이번 범위에서 제외 (Phase 2 TODO)
--   - pending_realtor 중간 role 전환 로직은 이번 범위에서 제외 (realtor_applications 존재 여부로 프론트에서 판단)
--
-- PASS 기준: (1) 일반 사용자의 role 자가승격 차단  (2) 기존 admin 승인 코드(approveRealtorApplication,
-- 일반 authenticated UPDATE 방식) 무변경 상태로 계속 동작
-- 이 중 하나라도 실패하면 트리거를 제거/완화하는 우회 수정을 하지 말고, 원인을 먼저 진단할 것
-- (진단 절차는 이 레포의 검증 런북 문서 참고)


-- ========================================
-- (1) handle_new_user(): 회원가입 시 클라이언트가 보낸 raw_user_meta_data.role을 신뢰하지 않음
--     신규 가입자는 예외 없이 role='customer'로 생성. realtor/admin 승격은 이후 admin 승인 절차로만 처리
-- ========================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname, role, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    'customer', -- 이전: coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer') — 클라이언트 입력을 신뢰했음
    coalesce(new.raw_user_meta_data->>'preferred_language', 'ko')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
-- SECURITY DEFINER 사유: auth.users에 새 계정이 생기는 시점에 profiles insert 권한이 필요하며,
-- 기존 schema.sql 원본부터 이미 이 방식으로 동작 중이던 함수를 그대로 교체하는 것뿐이라 신규 위험 없음.
-- 기존 트리거 on_auth_user_created(schema.sql:57-59)가 이 함수를 그대로 참조하므로 트리거 재생성 불필요.


-- ========================================
-- (2) prevent_self_role_change(): profiles.role 컬럼은 admin만 바꿀 수 있음 (BEFORE UPDATE 트리거)
-- ========================================
create or replace function public.prevent_self_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null  -- auth.uid()가 NULL인 경우(Supabase SQL Editor에서 postgres/service_role로 직접 실행)는
                                  -- 이미 DB 자격증명이 필요한 상위 신뢰 영역이자 RLS 자체가 적용되지 않는 컨텍스트이므로
                                  -- 이 트리거의 통제 대상에서 제외한다(README에 문서화된 "수동 승인" 경로 보존).
                                  -- 이 컨텍스트는 이미 모든 RLS를 우회할 수 있어 트리거로 막아도 실질적 방어 효과가 없다.
     and coalesce(public.current_user_role(), '') <> 'admin' then
    raise exception 'role 변경 권한이 없습니다.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
-- SECURITY DEFINER 사유: 함수 본문이 하는 일은 값 비교와 예외 발생뿐이라 상승 권한이 필수는 아니지만,
-- current_user_role()과 동일하게 STABLE한 조회 함수 컨벤션을 맞추고, search_path 고정을 통해
-- 스키마 하이재킹(다른 search_path에 동일 이름 함수를 심는 공격)을 방지하기 위해 지정.

drop trigger if exists trg_prevent_self_role_change on public.profiles;
create trigger trg_prevent_self_role_change
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();


-- ========================================
-- 롤백 (긴급 장애 대응 목적 이외에는 비권장 — 롤백 시 자가 승격 취약점이 다시 열림)
-- ========================================
-- drop trigger if exists trg_prevent_self_role_change on public.profiles;
-- drop function if exists public.prevent_self_role_change();
-- -- handle_new_user()는 schema.sql 원본 정의로 다시 create or replace 실행:
-- create or replace function public.handle_new_user()
-- returns trigger as $$
-- begin
--   insert into public.profiles (id, nickname, role, preferred_language)
--   values (
--     new.id,
--     coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
--     coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
--     coalesce(new.raw_user_meta_data->>'preferred_language', 'ko')
--   );
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
