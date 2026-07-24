-- 운영자(admin) 전용 관리 페이지: 요청서 전체 조회/강제종료, 공개 매물 등록/관리 권한
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_009_public_listings.sql까지 먼저 실행되어 있어야 함

drop policy if exists "requests_select_own_or_realtor" on requests;
create policy "requests_select_own_or_realtor" on requests
  for select to authenticated
  using (
    created_by = auth.uid()
    or customer_id = auth.uid()
    or public.current_user_role() = 'realtor'
    or public.current_user_role() = 'admin'
  );

drop policy if exists "requests_update_own" on requests;
create policy "requests_update_own" on requests
  for update to authenticated
  using (created_by = auth.uid() or public.current_user_role() = 'admin')
  with check (created_by = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "properties_insert_realtor" on properties;
create policy "properties_insert_realtor" on properties
  for insert to authenticated
  with check (
    (realtor_id = auth.uid() and public.current_user_role() = 'realtor')
    or (public.current_user_role() = 'admin' and is_public = true)
  );

drop policy if exists "properties_update_related" on properties;
create policy "properties_update_related" on properties
  for update to authenticated
  using (
    realtor_id = auth.uid()
    or exists (
      select 1 from requests r
      where r.id = properties.request_id
        and (r.customer_id = auth.uid() or r.created_by = auth.uid())
    )
    or public.current_user_role() = 'admin'
  );

drop policy if exists "property_images_insert_realtor" on property_images;
create policy "property_images_insert_realtor" on property_images
  for insert to authenticated
  with check (
    exists (
      select 1 from properties p
      where p.id = property_images.property_id and p.realtor_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );
