-- 마이그레이션 003: 매물 사진 업로드를 위한 Storage 버킷 + 업로드 권한 설정
-- 실행 방법: Supabase SQL Editor에 전체 붙여넣고 Run

-- 매물 사진을 저장할 공간(버킷) 생성. public으로 만들어서, 업로드된 사진은 URL만 알면 누구나 볼 수 있음
-- (매물 사진은 어차피 손님을 끌기 위한 홍보용이라 비공개로 할 이유가 없음)
insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

-- 공인중개사만 이 버킷에 파일을 업로드할 수 있도록 제한
create policy "realtor_upload_property_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-images'
  and public.current_user_role() = 'realtor'
);

-- 자기가 올린 사진은 자기가 지울 수 있도록 허용
create policy "realtor_delete_own_property_images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'property-images'
  and owner = auth.uid()
);
