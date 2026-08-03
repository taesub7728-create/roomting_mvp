import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// 조건 요청서 저장. 지금은 고객 본인이 작성하는 흐름만 지원
// (에이전트가 다른 고객을 대신 작성하는 기능은 이후 단계에서 customer_id를 선택하는 UI와 함께 추가 예정)
export async function createRequest({
  regionText,
  propertyCategory,
  dealType,
  rentMax,
  depositMax,
  depositMin,
  jeonseLoanPlanned,
  jeonseLoanDetail,
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
      property_category: propertyCategory ?? 'residential',
      deal_type: dealType ?? 'rent',
      rent_max: rentMax,
      deposit_max: depositMax,
      deposit_min: depositMin ?? null,
      jeonse_loan_planned: jeonseLoanPlanned ?? null,
      jeonse_loan_detail: jeonseLoanDetail ?? null,
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

// 공인중개사가 보는 "열려있는 요청서" 목록 (RLS가 realtor 역할에게 전체 requests를 허용해줌)
export async function listOpenRequests() {
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

export async function getRequestById(requestId) {
  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 고객이 "더 이상 응답 안 받을래요" 하고 요청서를 마감할 때 사용
export async function closeRequest(requestId) {
  const { data, error } = await supabase
    .from('requests')
    .update({ status: 'closed' })
    .eq('id', requestId)
    .select()
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 운영자가 보는 전체 요청서 목록(상태 무관) - 관리자 페이지 전용, RLS가 admin 역할에게만 전체를 허용해줌
export async function listAllRequests() {
  const { data, error } = await supabase
    .from('requests')
    .select('*, customer:profiles!customer_id(nickname)')
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 고객/에이전트가 보는 "내가 작성한 요청서와, 거기 달린 응답 개수" 목록
export async function listMyRequests() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('requests')
    .select('*')
    .or(`customer_id.eq.${user.id},created_by.eq.${user.id}`)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}
