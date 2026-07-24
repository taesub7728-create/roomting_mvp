-- 공개 매물 등록은 realtor 본인만 가능하도록 강화 (admin이 임의 부동산 이름으로 대신 등록하는 경로를 DB 단에서도 차단)
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: migration_011_address_privacy.sql까지 먼저 실행되어 있어야 함

drop policy if exists "properties_insert_realtor" on properties;
create policy "properties_insert_realtor" on properties
  for insert to authenticated
  with check (
    realtor_id = auth.uid() and public.current_user_role() = 'realtor'
  );

drop policy if exists "property_images_insert_realtor" on property_images;
create policy "property_images_insert_realtor" on property_images
  for insert to authenticated
  with check (
    exists (
      select 1 from properties p
      where p.id = property_images.property_id and p.realtor_id = auth.uid()
    )
  );

-- properties_update_related, requests 관련 정책은 그대로 둠
-- (admin은 여전히 기존 매물의 노출상태 변경/요청서 강제종료 등 "관리"는 가능 - 이번에 막는 건 "임의 부동산으로 신규 등록"만)
