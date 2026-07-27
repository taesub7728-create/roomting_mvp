-- 마이그레이션 017: prevent_self_role_change() 트리거 함수의 enum 캐스팅 버그 수정
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_016_role_security_fix.sql까지 먼저 실행되어 있어야 함
-- 주의: migration_016 파일 자체는 수정하지 않음. 이 파일이 해당 함수를 다시 CREATE OR REPLACE 함
--
-- 버그 원인:
--   public.current_user_role()은 user_role enum 타입을 반환한다(policies.sql:6-14).
--   migration_016의 coalesce(public.current_user_role(), '') 에서 두 번째 인자 ''(text 리터럴)를
--   Postgres가 첫 번째 인자의 타입(user_role)에 맞춰 암시적으로 캐스팅하려고 시도하는데,
--   user_role enum에는 빈 문자열('') 값이 존재하지 않아
--   "invalid input value for enum user_role: ''" 에러가 발생한다.
--   이 표현식은 role이 바뀌는 모든 UPDATE(공격 시도든 정상 admin 승인이든)마다 평가되므로,
--   수정 전까지는 두 경로 모두 항상 에러로 막혀 있었을 것으로 판단됨.
--
-- 수정 내용: current_user_role()의 결과를 먼저 ::text로 캐스팅한 뒤 coalesce로 넘김
--   (coalesce(public.current_user_role(), '') → coalesce(public.current_user_role()::text, ''))
--   함수의 나머지 로직(admin 여부 판단, auth.uid() IS NULL 예외 처리, 예외 메시지)은 동일하게 유지.

create or replace function public.prevent_self_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null  -- auth.uid()가 NULL인 경우(Supabase SQL Editor에서 postgres/service_role로 직접 실행)는
                                  -- 이미 DB 자격증명이 필요한 상위 신뢰 영역이자 RLS 자체가 적용되지 않는 컨텍스트이므로
                                  -- 이 트리거의 통제 대상에서 제외한다(README에 문서화된 "수동 승인" 경로 보존).
                                  -- 이 컨텍스트는 이미 모든 RLS를 우회할 수 있어 트리거로 막아도 실질적 방어 효과가 없다.
     and coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'role 변경 권한이 없습니다.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
-- SECURITY DEFINER 사유: migration_016과 동일 — current_user_role()과 동일한 STABLE 조회 함수 컨벤션을
-- 맞추고, search_path 고정으로 스키마 하이재킹을 방지하기 위해 지정.
-- 트리거 trg_prevent_self_role_change는 함수 이름으로 바인딩되어 있으므로 재생성 불필요.


-- ========================================
-- 롤백 (비권장 — 롤백 시 role 변경 UPDATE가 다시 항상 에러로 막히는 버그 상태로 되돌아감)
-- ========================================
-- create or replace function public.prevent_self_role_change()
-- returns trigger as $$
-- begin
--   if new.role is distinct from old.role
--      and auth.uid() is not null
--      and coalesce(public.current_user_role(), '') <> 'admin' then
--     raise exception 'role 변경 권한이 없습니다.';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
