-- 마이그레이션 005: 채팅 메시지에 번역 결과(translated_text 등)를 나중에 업데이트할 수 있도록
-- 본인이 보낸 메시지에 한해 수정 권한 추가
create policy "chat_messages_update_own"
on chat_messages
for update
to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());
