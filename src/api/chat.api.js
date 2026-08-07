import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { translateText } from './translate.api'

// 채팅방 자체는 계속 직접 조회한다. chat_rooms에는 민감 정보가 없고(id/property_id/
// customer_id/realtor_id/created_at/*_last_read_at), RLS가 이미 참여자로 제한하며,
// markChatRoomRead()의 UPDATE와 realtime 구독이 테이블 접근을 필요로 한다.
// 참여자 프로필(닉네임/선호 언어)만 022 RPC로 분리했다 - 아래 getChatParticipants() 참고.
const ROOM_COLUMNS = '*'

// 매물(property) 하나당, 문의하는 고객별로 채팅방 1개.
// 요청서에 대한 응답 매물은 그 요청서 주인이 곧 고객이고, 공개 매물(지도)은 지금 로그인한 사람이 고객이 됨
export async function getOrCreatePropertyChatRoom(propertyId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('realtor_id, request_id, requests(customer_id)')
    .eq('id', propertyId)
    .single()
  if (propertyError) return { data: null, error: toFriendlyError(propertyError) }

  // 예전에는 `property.requests?.customer_id ?? user.id` 한 줄이었다. 두 가지 서로 다른
  // 상황("공개 매물이라 요청서가 없다" / "요청서는 있는데 조인이 비어 돌아왔다")이 같은
  // 폴백으로 흘러, 후자에서 호출자 본인을 고객으로 삼은 엉뚱한 채팅방이 만들어진다.
  //
  // migration_030이 적용되면 중개사는 requests를 더 이상 직접 읽지 못한다. PostgREST의
  // embedded join은 RLS로 걸리면 에러가 아니라 null을 주므로, 중개사가 응답 매물의 채팅에
  // 들어가는 순간 customer_id=중개사 본인인 방이 조용히 생긴다.
  // 그래서 두 상황을 request_id로 명시적으로 갈라놓는다.
  //
  // ★ 이건 임시 조치다. 최종 해법은 029의 resolve_chat_customer_id()로 판단 자체를
  //   서버로 옮기는 것이고, 029 적용과 함께 전환한다(TODO_PHASE2.md 프론트 B 항목).
  let customerId
  if (property.request_id === null) {
    customerId = user.id // 공개 매물(지도): 문의한 본인이 고객
  } else {
    customerId = property.requests?.customer_id
    if (!customerId) {
      return { data: null, error: '채팅 상대를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.' }
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from('chat_rooms')
    .select(ROOM_COLUMNS)
    .eq('property_id', propertyId)
    .eq('customer_id', customerId)
    .maybeSingle()
  if (existingError) return { data: null, error: toFriendlyError(existingError) }
  if (existing) return { data: existing, error: null }

  const { data: created, error: createError } = await supabase
    .from('chat_rooms')
    .insert({
      property_id: propertyId,
      customer_id: customerId,
      realtor_id: property.realtor_id,
    })
    .select(ROOM_COLUMNS)
    .single()

  if (createError) {
    // 상대방이 거의 동시에 먼저 채팅방을 만들어버린 경우 - 에러 대신 그 방을 그대로 가져옴
    if (createError.code === '23505') {
      const { data: raceExisting, error: raceError } = await supabase
        .from('chat_rooms')
        .select(ROOM_COLUMNS)
        .eq('property_id', propertyId)
        .eq('customer_id', customerId)
        .single()
      if (raceError) return { data: null, error: toFriendlyError(raceError) }
      return { data: raceExisting, error: null }
    }
    return { data: null, error: toFriendlyError(createError) }
  }
  return { data: created, error: null }
}

// 채팅방 참여자 2명의 표시 정보 (닉네임 / 선호 언어). 022 RPC.
//
// 인자는 property_id가 아니라 chat_room_id다. 라우트가 /chat/:propertyId라서 헷갈리기 쉬운데,
// 여기에 property_id를 넣으면 에러가 아니라 0행이 돌아온다(= 무관한 사용자로 차단된 것과
// 구분되지 않는다). 호출부는 getOrCreatePropertyChatRoom()이 돌려준 room.id를 넘길 것.
//
// 호출자 검증은 서버가 한다 - auth.uid()가 그 방의 참여자가 아니면 0행이다.
// phone은 반환 컬럼에 아예 없다(고객 연락처가 중개사에게 넘어가지 않게 하는 것이 022의 목적).
export async function getChatParticipants(chatRoomId) {
  const { data, error } = await supabase
    .rpc('get_chat_participants', { p_room_id: chatRoomId })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

export async function listMessages(chatRoomId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_room_id', chatRoomId)
    .order('created_at', { ascending: true })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 메시지를 보내고, 상대방 언어로 자동번역까지 함께 저장
// 번역이 실패해도 메시지 자체는 저장되게 해서, 채팅이 아예 멈추지 않도록 함
export async function sendMessage({ chatRoomId, text, senderLanguage, recipientLanguage }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data: inserted, error: insertError } = await supabase
    .from('chat_messages')
    .insert({
      chat_room_id: chatRoomId,
      sender_id: user.id,
      original_text: text,
      original_language: senderLanguage,
      translation_status: 'pending',
    })
    .select()
    .single()
  if (insertError) return { data: null, error: toFriendlyError(insertError) }

  if (senderLanguage === recipientLanguage) {
    // 같은 언어면 번역할 필요 없음
    const { data: updated } = await supabase
      .from('chat_messages')
      .update({ translation_status: 'success' })
      .eq('id', inserted.id)
      .select()
      .single()
    return { data: updated ?? inserted, error: null }
  }

  const { data: translated, error: translateError } = await translateText(text, recipientLanguage)
  const { data: updated } = await supabase
    .from('chat_messages')
    .update({
      translated_text: translated,
      translated_language: recipientLanguage,
      translation_status: translateError ? 'failed' : 'success',
    })
    .eq('id', inserted.id)
    .select()
    .single()

  return { data: updated ?? inserted, error: null }
}

// 지금 이 채팅방을 읽었다는 시각을 기록 (isCustomer에 따라 어느 쪽 시각인지 결정)
export async function markChatRoomRead(chatRoomId, isCustomer) {
  const column = isCustomer ? 'customer_last_read_at' : 'realtor_last_read_at'
  const { error } = await supabase
    .from('chat_rooms')
    .update({ [column]: new Date().toISOString() })
    .eq('id', chatRoomId)
  if (error) return { error: toFriendlyError(error) }
  return { error: null }
}

// 상대방이 채팅방을 읽어서 last_read_at이 바뀌면 실시간으로 알려주는 구독
export function subscribeToRoomUpdates(chatRoomId, onRoomUpdate) {
  const channel = supabase
    .channel(`chat_room_meta_${chatRoomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_rooms', filter: `id=eq.${chatRoomId}` },
      (payload) => onRoomUpdate(payload.new)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// 새 메시지가 오면 실시간으로 알려주는 구독. unsubscribe 함수를 반환함
export function subscribeToMessages(chatRoomId, onNewMessage) {
  const channel = supabase
    .channel(`chat_room_${chatRoomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_room_id=eq.${chatRoomId}` },
      (payload) => onNewMessage(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `chat_room_id=eq.${chatRoomId}` },
      (payload) => onNewMessage(payload.new)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
