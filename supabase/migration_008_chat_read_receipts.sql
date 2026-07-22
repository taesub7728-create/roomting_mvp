-- 마이그레이션 008: 채팅 읽음 확인 기능
-- 각자 이 채팅방을 마지막으로 읽은 시각을 저장해두고, 상대방 시각과 비교해서 "읽음" 표시

alter table chat_rooms
  add column if not exists customer_last_read_at timestamptz,
  add column if not exists realtor_last_read_at timestamptz;

create policy "chat_rooms_update_own"
on chat_rooms
for update
to authenticated
using (customer_id = auth.uid() or realtor_id = auth.uid())
with check (customer_id = auth.uid() or realtor_id = auth.uid());

alter publication supabase_realtime add table chat_rooms;
