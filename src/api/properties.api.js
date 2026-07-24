import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

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

// 공인중개사 본인이 지금까지 보낸 매물 응답 목록 (어떤 요청서에 보냈는지도 함께 표시)
export async function listMyPropertyResponses() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('properties')
    .select('*, requests(region_text), property_images(image_url, sort_order)')
    .eq('realtor_id', user.id)
    .not('request_id', 'is', null) // 공개 매물은 "요청서에 보낸 응답" 목록에서 제외
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 지도에 표시할 공개 매물 목록 (좌표가 있고 노출 중인 것만)
export async function listPublicProperties() {
  const { data, error } = await supabase
    .from('properties')
    .select('*, property_images(image_url, sort_order)')
    .eq('is_public', true)
    .eq('listing_status', 'active')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 특정 요청서에 달린 매물 응답 목록 (고객/에이전트가 받은 응답 확인할 때 사용)
// realtor(응답한 공인중개사)의 닉네임, 매물 사진도 함께 가져옴
export async function listPropertiesForRequest(requestId) {
  const { data, error } = await supabase
    .from('properties')
    .select('*, realtor:profiles(nickname), property_images(image_url, sort_order)')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 매물 사진 파일들을 Storage에 올리고, property_images 테이블에 URL을 기록
// 실패한 파일이 있어도 나머지는 계속 진행하고, 실패 목록을 함께 알려줌
export async function uploadPropertyImages(propertyId, files) {
  const uploadedUrls = []
  const failedFiles = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const path = `${propertyId}/${Date.now()}-${i}-${file.name}`

    const { error: uploadError } = await supabase.storage.from('property-images').upload(path, file)
    if (uploadError) {
      failedFiles.push(file.name)
      continue
    }

    const { data: publicUrlData } = supabase.storage.from('property-images').getPublicUrl(path)
    uploadedUrls.push(publicUrlData.publicUrl)
  }

  if (uploadedUrls.length > 0) {
    const rows = uploadedUrls.map((url, idx) => ({ property_id: propertyId, image_url: url, sort_order: idx }))
    const { error: insertError } = await supabase.from('property_images').insert(rows)
    if (insertError) return { data: null, error: toFriendlyError(insertError) }
  }

  if (failedFiles.length > 0) {
    return { data: { uploadedCount: uploadedUrls.length }, error: `일부 사진 업로드에 실패했어요: ${failedFiles.join(', ')}` }
  }
  return { data: { uploadedCount: uploadedUrls.length }, error: null }
}
