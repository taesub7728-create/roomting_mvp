-- 운영자 페이지에서 공인중개사 지원서를 검토/승인할 수 있도록 profiles 수정 권한에 admin 우회 추가
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_014_realtor_application_fields.sql까지 먼저 실행되어 있어야 함

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update to authenticated
  using (auth.uid() = id or public.current_user_role() = 'admin')
  with check (auth.uid() = id or public.current_user_role() = 'admin');
