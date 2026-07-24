-- 공인중개사·에이전트 자체 지원(가입) 흐름: pending_realtor 상태 + 지원서 테이블 + 서류 업로드 버킷
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_012_realtor_only_listings.sql까지 먼저 실행되어 있어야 함

-- 1. 승인 대기 상태 추가
alter type user_role add value if not exists 'pending_realtor';

-- 2. 지원서 정보 테이블
create table realtor_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  company_name text not null,
  business_registration_number text not null,
  contact_name text not null,
  contact_phone text not null,
  document_path text not null, -- realtor-documents 버킷 안의 파일 경로 (비공개 버킷이라 공개 URL이 아니라 경로만 저장, 조회 시 signed URL을 발급해서 씀)
  created_at timestamptz not null default now()
);

alter table realtor_applications enable row level security;

create policy "realtor_applications_select_own_or_admin" on realtor_applications
  for select to authenticated
  using (profile_id = auth.uid() or public.current_user_role() = 'admin');

create policy "realtor_applications_insert_own" on realtor_applications
  for insert to authenticated
  with check (profile_id = auth.uid());

-- 3. 사업자등록증 등 서류를 저장할 비공개 버킷 (매물 사진과 달리 민감정보라 public=false)
insert into storage.buckets (id, name, public)
values ('realtor-documents', 'realtor-documents', false)
on conflict (id) do nothing;

create policy "authenticated_upload_realtor_documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'realtor-documents');

create policy "own_or_admin_read_realtor_documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'realtor-documents' and (owner = auth.uid() or public.current_user_role() = 'admin'));

-- 4. 승인 방법 (관리자 화면 만들기 전까지는 수동으로):
-- select * from realtor_applications order by created_at desc; 로 대기 목록 확인 후
-- update profiles set role = 'realtor' where id = '승인할_profile_id';
