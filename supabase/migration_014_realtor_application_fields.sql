-- 공인중개사 지원서 항목 보강: 유선전화번호/중개등록번호/중개등록증/주소 + 유선전화번호 중복가입 체크
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_013_realtor_applications.sql까지 먼저 실행되어 있어야 함

alter table realtor_applications
  add column landline_phone text,
  add column broker_registration_number text,
  add column broker_registration_document_path text, -- 중개등록증 파일 경로 (document_path는 사업자등록증용으로 계속 사용)
  add column company_address text;

-- 가입 폼 제출 "전"(계정 생성 전, 로그인 세션 없음)에 호출되는 함수라 RLS를 우회해야 함
-- 신청 정보를 그대로 노출하지 않고 "이미 등록됐는지(true/false)"만 알려줌
create or replace function public.check_landline_duplicate(phone text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from realtor_applications ra
    join profiles p on p.id = ra.profile_id
    where ra.landline_phone = phone
      and p.role in ('realtor', 'pending_realtor')
  );
$$;

grant execute on function public.check_landline_duplicate(text) to anon, authenticated;
