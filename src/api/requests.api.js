import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// 조건 요청서 저장. 지금은 고객 본인이 작성하는 흐름만 지원
// (에이전트가 다른 고객을 대신 작성하는 기능은 이후 단계에서 customer_id를 선택하는 UI와 함께 추가 예정)
export async function createRequest({
  regionText,
  rentMax,
  depositMax,
  roomTypes,
  contractMonths,
  amenities,
  extraNote,
  moveInDate,
  registrationRequired,
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('requests')
    .insert({
      customer_id: user.id,
      created_by: user.id,
      region_text: regionText,
      rent_max: rentMax,
      deposit_max: depositMax,
      room_types: roomTypes,
      contract_months: contractMonths,
      amenities,
      extra_note: extraNote || null,
      move_in_date: moveInDate || null,
      registration_required: registrationRequired,
    })
    .select()
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}
