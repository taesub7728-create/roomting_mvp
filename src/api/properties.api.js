import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { safeFileName } from '../utils/safeFileName'

// 공인중개사가 특정 요청서에 매물로 응답
export async function createPropertyResponse({ requestId, title, address, description, deposit, monthlyRent, roomType }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('properties')
    .insert({
      request_id: requestId,
      realtor_id: user.id,
      title,
      address,
      description: description || null,
      deposit,
      monthly_rent: monthlyRent,
      room_type: roomType,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { data: null, error: '이미 이 요청서에 응답을 보내셨어요. 같은 요청에는 한 번만 응답할 수 있습니다.' }
    return { data: null, error: toFriendlyError(error) }
  }
  return { data, error: null }
}

// 매물 하나의 상세 정보 (채팅방 맨 위에 어떤 매물 얘기인지 보여줄 때 사용)
export async function getPropertyById(propertyId) {
  const { data, error } = await supabase
    .from('properties')
    .select('*, property_images(image_url, sort_order)')
    .eq('id', propertyId)
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// ★ listMyPropertyResponses() 는 2026-08-10 에 삭제했다.
//   properties 에 requests(region_text) 를 embedded join 하던 함수인데, migration_030 이
//   중개사의 requests SELECT 를 없애면 그 조인이 에러 없이 null 이 되어 지역명이 조용히
//   사라진다(PostgREST 의 embedded join 은 RLS 로 걸리면 에러가 아니라 null 이다).
//   대체는 realtorRequests.api.js 의 listMyResponsesForRealtor() (migration_029 의 RPC)다.

// 지도에 표시할 공개 매물 목록 (좌표가 있고 노출 중인 것만)
// DB 함수(get_public_listings)를 통해 조회 - 상세주소 비공개 매물은 여기서 이미 동 단위 주소/근사 좌표로 바뀐 값만 내려옴
export async function listPublicProperties() {
  const { data, error } = await supabase.rpc('get_public_listings')
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 공인중개사 본인이 등록한 공개 매물 목록 (노출상태 무관)
export async function listMyPublicListings() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('properties')
    .select('*, property_images(image_url, sort_order)')
    .eq('is_public', true)
    .eq('realtor_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 운영자 관리 페이지용: 노출상태 무관 전체 공개 매물 목록
export async function listAllPublicListings() {
  const { data, error } = await supabase
    .from('properties')
    .select('*, realtor:profiles!realtor_id(nickname), property_images(image_url, sort_order)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 공인중개사 본인이 지도에 올릴 공개 매물을 직접 등록 (담당 부동산은 항상 로그인한 본인)
export async function createPublicProperty({
  title, address, description, deposit, monthlyRent, roomType, lat, lng, listingStatus, addressPublic,
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('properties')
    .insert({
      realtor_id: user.id,
      is_public: true,
      title,
      address,
      description: description || null,
      deposit,
      monthly_rent: monthlyRent,
      room_type: roomType,
      lat,
      lng,
      listing_status: listingStatus || 'active',
      address_public: addressPublic !== false,
    })
    .select()
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 공인중개사 본인이 등록한 공개 매물 정보 수정 (RLS: realtor_id = auth.uid()인 매물만 UPDATE 허용)
export async function updatePublicProperty(propertyId, {
  title, address, description, deposit, monthlyRent, roomType, lat, lng, listingStatus, addressPublic,
}) {
  const { data, error } = await supabase
    .from('properties')
    .update({
      title,
      address,
      description: description || null,
      deposit,
      monthly_rent: monthlyRent,
      room_type: roomType,
      lat,
      lng,
      listing_status: listingStatus || 'active',
      address_public: addressPublic !== false,
    })
    .eq('id', propertyId)
    .select()
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 공개 매물의 노출상태(판매중/거래완료/미노출) 변경
export async function updateListingStatus(propertyId, status) {
  const { data, error } = await supabase
    .from('properties')
    .update({ listing_status: status })
    .eq('id', propertyId)
    .select()
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 특정 요청서에 달린 매물 응답 목록 (고객/에이전트가 받은 응답 확인할 때 사용)
// realtor(응답한 공인중개사)의 표시명, 매물 사진도 함께 가져옴
//
// 022 RPC로 전환됨. 이전에는 properties를 직접 select하면서 profiles를 embedded join했는데,
// 023이 profiles SELECT를 본인+admin으로 잠그면 그 조인이 에러 없이 null이 되어 부동산 이름이
// 조용히 "공인중개사"로 열화된다. 요청서 소유 검증은 이제 함수 본문이 서버에서 한다.
//
// 반환 컬럼은 11개로 고정된다(property_id / realtor_id / realtor_display_name / title /
// address / description / deposit / monthly_rent / room_type / created_at / property_images).
// 예전 select('*')가 주던 status/request_id/is_public/lat/lng/listing_status/address_public은
// 화면에서 참조하지 않아 제외됐다 - 새로 필요해지면 함수 반환 타입 변경(= v2 함수 신설)이
// 필요하다. create or replace로는 컬럼을 추가할 수 없다(TODO_PHASE2.md 10번 항목).
//
// 정렬도 created_at desc에서 nickname, created_at desc로 바뀐다. 같은 사무소의 응답이
// 연속으로 오게 하려는 RPC 쪽 설계 의도다.
export async function listPropertiesForRequest(requestId) {
  const { data, error } = await supabase
    .rpc('list_request_responses_for_customer', { p_request_id: requestId })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 매물 사진 파일들을 Storage에 올리고, property_images 테이블에 URL을 기록
// 실패한 파일이 있어도 나머지는 계속 진행하고, 실패 목록을 함께 알려줌
// startOrder: 기존 사진이 있는 매물(수정 시 사진 추가)에 이어붙일 때, 기존 사진 개수를 넘겨서 sort_order가 겹치지 않게 함
export async function uploadPropertyImages(propertyId, files, startOrder = 0) {
  const uploadedUrls = []
  const failedFiles = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const path = `${propertyId}/${safeFileName(file)}`

    const { error: uploadError } = await supabase.storage.from('property-images').upload(path, file)
    if (uploadError) {
      failedFiles.push(file.name)
      continue
    }

    const { data: publicUrlData } = supabase.storage.from('property-images').getPublicUrl(path)
    uploadedUrls.push(publicUrlData.publicUrl)
  }

  if (uploadedUrls.length > 0) {
    const rows = uploadedUrls.map((url, idx) => ({ property_id: propertyId, image_url: url, sort_order: startOrder + idx }))
    const { error: insertError } = await supabase.from('property_images').insert(rows)
    if (insertError) return { data: null, error: toFriendlyError(insertError) }
  }

  if (failedFiles.length > 0) {
    return { data: { uploadedCount: uploadedUrls.length }, error: `일부 사진 업로드에 실패했어요: ${failedFiles.join(', ')}` }
  }
  return { data: { uploadedCount: uploadedUrls.length }, error: null }
}
