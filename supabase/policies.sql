-- 룸팅(Roomting) RLS 정책 (누가 어떤 데이터를 읽고/쓸 수 있는지 규칙)
-- 실행 방법: Supabase SQL Editor에 전체 붙여넣고 Run
-- 전제: supabase/schema.sql이 먼저 실행되어 테이블/타입이 만들어져 있어야 함

-- 현재 로그인한 사람의 역할(role)을 조회하는 헬퍼 함수 (정책 여러 곳에서 재사용)
create or replace function public.current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- ========================================
-- profiles
-- ========================================
create policy "profiles_select_authenticated" on profiles
  for select to authenticated
  using (true); -- 로그인한 사람은 서로의 기본 정보(닉네임 등)를 볼 수 있어야 채팅/요청 목록에 이름이 보임

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id); -- 본인 정보만 수정 가능

-- ========================================
-- requests (조건 요청서)
-- ========================================
create policy "requests_select_own_or_realtor" on requests
  for select to authenticated
  using (
    created_by = auth.uid()
    or customer_id = auth.uid()
    or public.current_user_role() = 'realtor' -- 공인중개사는 전체 요청서를 봐야 응답 가능
  );

create policy "requests_insert_own" on requests
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.current_user_role() in ('customer', 'care_agent') -- 고객 또는 에이전트만 작성 가능
  );

create policy "requests_update_own" on requests
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ========================================
-- properties (매물 응답)
-- ========================================
create policy "properties_select_related" on properties
  for select to authenticated
  using (
    realtor_id = auth.uid()
    or exists (
      select 1 from requests r
      where r.id = properties.request_id
        and (r.customer_id = auth.uid() or r.created_by = auth.uid())
    )
  );

create policy "properties_insert_realtor" on properties
  for insert to authenticated
  with check (
    realtor_id = auth.uid()
    and public.current_user_role() = 'realtor'
  );

create policy "properties_update_related" on properties
  for update to authenticated
  using (
    realtor_id = auth.uid()
    or exists (
      select 1 from requests r
      where r.id = properties.request_id
        and (r.customer_id = auth.uid() or r.created_by = auth.uid())
    )
  );

-- ========================================
-- property_images (매물 사진)
-- ========================================
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
        )
    )
  );

create policy "property_images_insert_realtor" on property_images
  for insert to authenticated
  with check (
    exists (
      select 1 from properties p
      where p.id = property_images.property_id and p.realtor_id = auth.uid()
    )
  );

-- ========================================
-- favorites (찜한 매물)
-- ========================================
create policy "favorites_select_own" on favorites
  for select to authenticated using (customer_id = auth.uid());

create policy "favorites_insert_own" on favorites
  for insert to authenticated with check (customer_id = auth.uid());

create policy "favorites_delete_own" on favorites
  for delete to authenticated using (customer_id = auth.uid());

-- ========================================
-- chat_rooms / chat_messages (채팅)
-- ========================================
create policy "chat_rooms_select_related" on chat_rooms
  for select to authenticated
  using (customer_id = auth.uid() or realtor_id = auth.uid());

create policy "chat_rooms_insert_related" on chat_rooms
  for insert to authenticated
  with check (customer_id = auth.uid() or realtor_id = auth.uid());

create policy "chat_messages_select_related" on chat_messages
  for select to authenticated
  using (
    exists (
      select 1 from chat_rooms cr
      where cr.id = chat_messages.chat_room_id
        and (cr.customer_id = auth.uid() or cr.realtor_id = auth.uid())
    )
  );

create policy "chat_messages_insert_related" on chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from chat_rooms cr
      where cr.id = chat_messages.chat_room_id
        and (cr.customer_id = auth.uid() or cr.realtor_id = auth.uid())
    )
  );

-- ========================================
-- care_packages (에이전트 케어 패키지 - 뼈대만, 신청 기능은 이후 단계)
-- ========================================
create policy "care_packages_select_own" on care_packages
  for select to authenticated
  using (customer_id = auth.uid() or care_agent_id = auth.uid());

create policy "care_packages_insert_own" on care_packages
  for insert to authenticated
  with check (customer_id = auth.uid());
