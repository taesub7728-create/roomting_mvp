import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// 중개사 측 요청서 조회. 전부 migration_029 의 RPC 를 거친다.
//
// ★ requests 테이블을 직접 읽지 않는다.
//   migration_030 이 `requests_select_own_or_realtor` 정책을 제거하면 중개사 세션에서
//   테이블 직접 조회가 0행이 된다. 029 의 RPC 는 컬럼 allowlist(returns table)와
//   영업지역 필터를 서버에 박아 두므로 030 이후에도 유일하게 동작하는 경로다.
//
// ★ 029 가 반환하지 않는 값을 다른 쿼리로 되찾지 않는다.
//   customer_id / created_by / location_lat / location_lng / station_id / district_code /
//   jeonse_loan_detail / region_text 는 의도적으로 제외된 것이다(029:67-80).
//   중개사 화면에 필요해 보이더라도 별도 조회로 우회하지 않는다.
//
// 029 함수 6개는 모두 language sql / stable / security definer /
// search_path = pg_catalog, public 이고 **명시적 RAISE 가 없다**(파일 전체 grep 0건).
// 따라서 실패는 권한/전송 오류로만 나타나고, 조건 불일치는 예외가 아니라 0행이다.

/**
 * 내 영업지역의 open 요청서 목록.
 *
 * 반환 컬럼(19): id, station_name_ko, line_names, district_name_ko, property_category,
 *   deal_type, rent_max, deposit_max, deposit_min, jeonse_loan_planned, room_types,
 *   contract_months, amenities, extra_note, move_in_date, registration_required,
 *   response_count, created_at, my_response_count
 *
 * 영업지역이 없거나 role 이 realtor 가 아니면 예외가 아니라 빈 배열이다.
 */
export async function listOpenRequestsForRealtor() {
  const { data, error } = await supabase.rpc('list_open_requests_for_realtor')
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data: data ?? [], error: null }
}

/**
 * 응답 작성 화면용 단건. 내 영업지역의 open 요청서만 나온다.
 * 조건에 맞지 않으면 0행이므로 data 는 null 이 된다(에러가 아니다).
 */
export async function getOpenRequestForRealtor(requestId) {
  const { data, error } = await supabase.rpc('get_open_request_for_realtor', {
    p_request_id: requestId,
  })
  if (error) return { data: null, error: toFriendlyError(error) }
  // returns table 이라 배열로 온다. 조건상 0행 또는 1행이다.
  return { data: data?.[0] ?? null, error: null }
}

/**
 * 이미 응답한 요청서의 상세. 영업지역 조건이 없고 status 를 함께 반환한다.
 *
 * ★ get_open_request_for_realtor 와 합치지 않는다. 029:243-245 가 두 함수를 나눈 이유가
 *   권한 범위 차이다 - 이쪽은 "내가 응답했다"는 사실이 열람 근거라 영업지역이 바뀌어도,
 *   요청서가 마감돼도 계속 볼 수 있어야 한다.
 *
 * 반환 컬럼은 위 19개 + status.
 */
export async function getRespondedRequestForRealtor(requestId) {
  const { data, error } = await supabase.rpc('get_responded_request_for_realtor', {
    p_request_id: requestId,
  })
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data: data?.[0] ?? null, error: null }
}

/**
 * "내가 보낸 응답" 목록.
 *
 * 반환 컬럼(12): property_id, request_id, station_name_ko, district_name_ko,
 *   request_status, title, address, deposit, monthly_rent, room_type, created_at,
 *   property_images
 *
 * ★ 기존 listMyPropertyResponses() 와 컬럼 이름이 다르다. 특히 매물 id 가
 *   `id` 가 아니라 `property_id` 다. 채팅 링크(/chat/:propertyId)가 이 값을 쓴다.
 */
export async function listMyResponsesForRealtor() {
  const { data, error } = await supabase.rpc('list_my_responses_for_realtor')
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data: data ?? [], error: null }
}

/**
 * 내가 이 요청서에 보낸 매물 수.
 *
 * 목록 화면은 list_open_requests_for_realtor 가 함께 주는 my_response_count 를 쓰면 되고,
 * 이 함수는 단건 화면에서 개수만 필요할 때 쓴다. properties 를 직접 세지 않는다.
 */
export async function getRealtorResponseCount(requestId) {
  const { data, error } = await supabase.rpc('realtor_response_count', {
    p_request_id: requestId,
  })
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data: data ?? 0, error: null }
}
