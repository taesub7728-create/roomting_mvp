import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { translateText } from './translate.api'

// customer/realtor 양쪽의 닉네임과 선호 언어까지 함께 가져옴 (번역 대상 언어를 정할 때 필요)
const ROOM_WITH_PARTICIPANTS = '*, customer:profiles!customer_id(id, nickname, preferred_language), realtor:profiles!realtor_id(id, nickname, preferred_language)'

// 매물 응답(property) 하나당 채팅방 1개. 없으면 새로 만들고, 있으면 그걸 반환
export async function getOrCreatePropertyChatRoom(propertyId) {
  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('realtor_id, requests(customer_id)')
    .eq('id', propertyId)
    .single()
  if (propertyError) return { data: null, error: toFriendlyError(propertyError) }

  const { data: existing, error: existingError } = await supabase
    .from('chat_rooms')
    .select(ROOM_WITH_PARTICIPANTS)
    .eq('property_id', propertyId)
    .maybeSingle()
  if (existingError) return { data: null, error: toFriendlyError(existingError) }
  if (existing) return { data: existing, error: null }

  const { data: created, error: createError } = await supabase
    .from('chat_rooms')
    .insert({
      property_id: propertyId,
      customer_id: property.requests.customer_id,
      realtor_id: property.realtor_id,
    })
    .select(ROOM_WITH_PARTICIPANTS)
    .single()

  if (createError) {
    // 상대방이 거의 동시에 먼저 채팅방을 만들어버린 경우 - 에러 대신 그 방을 그대로 가져옴
    if (createError.code === '23505') {
      const { data: raceExisting, error: raceError } = await supabase
        .from('chat_rooms')
        .select(ROOM_WITH_PARTICIPANTS)
        .eq('property_id', propertyId)
        .single()
      if (raceError) return { data: null, error: toFriendlyError(raceError) }
      return { data: raceExisting, error: null }
    }
    return { data: null, error: toFriendlyError(createError) }
  }
  return { data: created, error: null }
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
