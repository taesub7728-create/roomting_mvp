-- 마이그레이션 018: 심사 대기 중인 realtor 신청자의 requests INSERT 차단 (RLS 보강)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_017_fix_role_trigger_cast.sql까지 먼저 실행되어 있어야 함
--
-- 배경:
--   realtor_applications 테이블에는 status 컬럼이 없다. "심사 대기중"은 별도 상태 컬럼이 아니라
--   "이 profile_id로 된 신청서 행이 존재 + profiles.role이 아직 customer" 조합으로 판단하는 구조다
--   (프론트의 getMyRealtorApplication()/hasPendingRealtorApplication()과 동일한 기준).
--
--   기존 requests_insert_own 정책(policies.sql:39-44)은 realtor_applications를 전혀 참조하지
--   않아서, 심사 대기 중인 신청자(role은 여전히 'customer')가 Supabase API를 직접 호출하면
--   requests INSERT가 그대로 통과됐다. 프론트(CustomerRoute)는 이미 이 상태를 차단하도록
--   고쳐뒀지만, 실제 데이터 보호는 RLS가 최종 책임을 져야 하므로 이번 마이그레이션으로 보강한다.
--
-- 이번 마이그레이션의 범위:
--   - 일반 customer(신청 이력 없음): 계속 가능
--   - care_agent: 계속 가능 (아래 함수가 role='customer'일 때만 차단하도록 설계했으므로 영향 없음)
--   - 이미 승인된 realtor(role='realtor'): 기존에도 이미 차단 상태, 변화 없음
--   - 심사 대기 중인 신청자(role='customer' + realtor_applications 존재): 신규 차단


-- ========================================
-- is_pending_realtor_applicant(): 현재 로그인한 사용자가 "role은 customer인데 realtor 신청서를
-- 제출해 심사 대기 중인" 상태인지 판단. current_user_role()과 동일한 컨벤션(SECURITY DEFINER,
-- STABLE, SET search_path=public)으로 정의해 일관성을 유지한다.
-- ========================================
create or replace function public.is_pending_realtor_applicant()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'customer'
     and exists (
       select 1 from realtor_applications where profile_id = auth.uid()
     );
$$;
-- SECURITY DEFINER 사유: 내부에서 realtor_applications를 조회할 때 본인(auth.uid()) 소유 행만
-- 확인하므로 RLS를 우회해도 노출되는 정보가 없음. current_user_role()과 동일한 신뢰 모델을
-- 그대로 재사용한다.


-- ========================================
-- requests_insert_own 정책 보강: 심사 대기 중인 신청자는 통과하지 못하도록 조건 추가
-- ========================================
drop policy if exists "requests_insert_own" on requests;
create policy "requests_insert_own" on requests
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.current_user_role() in ('customer', 'care_agent') -- 고객 또는 에이전트만 작성 가능
    and not public.is_pending_realtor_applicant() -- 심사 대기 중인 realtor 신청자는 제외
  );


-- ========================================
-- 롤백
-- ========================================
-- drop policy if exists "requests_insert_own" on requests;
-- drop function if exists public.is_pending_realtor_applicant();
-- create policy "requests_insert_own" on requests
--   for insert to authenticated
--   with check (
--     created_by = auth.uid()
--     and public.current_user_role() in ('customer', 'care_agent')
--   );
