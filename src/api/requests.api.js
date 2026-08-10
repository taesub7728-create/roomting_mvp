import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// createRequest()가 세션 없음을 알릴 때 쓰는 고정 문자열. toFriendlyError()를 거치지 않는
// 유일한 에러 케이스라, 호출부에서 "세션이 아예 없는 상태"를 구분하는 신호로 재사용한다.
export const SESSION_REQUIRED_ERROR = '로그인이 필요합니다.'

// 조건 요청서 저장. 지금은 고객 본인이 작성하는 흐름만 지원
// (에이전트가 다른 고객을 대신 작성하는 기능은 이후 단계에서 customer_id를 선택하는 UI와 함께 추가 예정)
export async function createRequest({
  regionText,
  stationId,
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
  if (!user) return { data: null, error: SESSION_REQUIRED_ERROR }

  const { data, error } = await supabase
    .from('requests')
    .insert({
      customer_id: user.id,
      created_by: user.id,
      region_text: regionText,
      // 자동완성에서 고른 경우에만 채운다. 구버전 pending payload 에는 이 키가 없어
      // undefined 로 들어오므로 null 로 정규화한다.
      //
      // ★ district_code / location_lat / location_lng 는 여기서 보내지 않는다.
      //   migration_027 의 trg_fill_request_location 트리거가 station_id 를 근거로
      //   stations / station_districts 에서 파생한다. station_id 가 null 이면 셋 다 null 이 된다.
      station_id: stationId ?? null,
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

  // rawError: classifySubmitFailure()가 code/message를 볼 수 있도록 가공 전 원본을 함께
  // 반환한다(다른 호출부는 이 필드를 그냥 무시하면 됨 - 기존 계약 안 깨짐).
  if (error) return { data: null, error: toFriendlyError(error), rawError: error }
  return { data, error: null }
}

// ★ listOpenRequests() 는 2026-08-10 에 삭제했다.
//   중개사가 requests 를 직접 읽던 경로이고, migration_030 이 `requests_select_own_or_realtor`
//   를 제거하면 0행이 된다. 대체는 realtorRequests.api.js 의 listOpenRequestsForRealtor()
//   (migration_029 의 RPC)다. 죽은 함수를 남겨 두면 나중에 누군가 다시 호출한다.

// 고객이 자기 요청서를 보는 경로. 중개사용이 아니다.
// migration_030 이후에도 `created_by = auth.uid() or customer_id = auth.uid()` 로 통과한다.
// 중개사의 요청서 상세는 029 의 get_open_request_for_realtor() 를 쓴다.
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
