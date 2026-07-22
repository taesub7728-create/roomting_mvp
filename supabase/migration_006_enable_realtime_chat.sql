-- 마이그레이션 006: 채팅 메시지가 새로고침 없이 실시간으로 뜨도록 Realtime 활성화
alter publication supabase_realtime add table chat_messages;
