-- 지도 탐색 기능: "공개 매물" 개념 도입
-- 실행 방법: Supabase 대시보드 > SQL Editor > New query 에 전체 붙여넣고 Run
-- 전제: schema.sql, policies.sql, migration_002~008이 먼저 실행되어 있어야 함

-- ========================================
-- 1. properties: 공개 매물 관련 컬럼 추가
-- ========================================

-- 공개 매물의 노출 상태 (판매중/거래완료/미노출) - property_status(응답 처리 상태)와는 다른 개념
create type listing_status as enum ('active', 'completed', 'hidden');

alter table properties
  alter column request_id drop not null; -- 공개 매물은 특정 요청서에 묶이지 않음

alter table properties
  add column is_public boolean not null default false,
  add column lat double precision,
  add column lng double precision,
  add column listing_status listing_status not null default 'active';

-- 요청서도 없고 공개도 아닌 고아 매물이 생기지 않도록 방지
alter table properties
  add constraint properties_request_or_public check (request_id is not null or is_public = true);

create index idx_properties_public on properties(is_public) where is_public = true;


-- ========================================
-- 2. chat_rooms: 매물 하나에 여러 고객이 각자 채팅할 수 있도록 unique 제약 변경
--    (공개 매물은 여러 명이 각자 문의할 수 있음. 기존 요청-응답 매물은 어차피 고객이 1명뿐이라 동작 그대로)
-- ========================================
alter table chat_rooms drop constraint chat_rooms_property_id_key;
alter table chat_rooms add constraint chat_rooms_property_customer_key unique (property_id, customer_id);


-- ========================================
-- 3. RLS 정책 갱신: 공개 매물은 로그인한 누구나 볼 수 있게
-- ========================================
drop policy if exists "properties_select_related" on properties;
create policy "properties_select_related" on properties
  for select to authenticated
  using (
    realtor_id = auth.uid()
    or exists (
      select 1 from requests r
      where r.id = properties.request_id
        and (r.customer_id = auth.uid() or r.created_by = auth.uid())
    )
    or (is_public and listing_status = 'active')
  );

drop policy if exists "property_images_select_related" on property_images;
create policy "property_images_select_related" on property_images
  for select to authenticated
  using (
    exists (
      select 1 from properties p
      where p.id = property_images.property_id
        and (
          p.realtor_id = auth.uid()
          or exists (
            select 1 from requests r
            where r.id = p.request_id
              and (r.customer_id = auth.uid() or r.created_by = auth.uid())
          )
          or (p.is_public and p.listing_status = 'active')
        )
    )
  );
