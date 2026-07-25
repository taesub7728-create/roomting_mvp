import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'

// 찜하기. 이미 찜한 매물이면(unique customer_id+property_id) 조용히 성공 처리
export async function addFavorite(propertyId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.from('favorites').insert({ customer_id: user.id, property_id: propertyId })
  if (error && error.code !== '23505') return { error: toFriendlyError(error) }
  return { error: null }
}

export async function removeFavorite(propertyId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const { error } = await supabase.from('favorites').delete().eq('customer_id', user.id).eq('property_id', propertyId)
  if (error) return { error: toFriendlyError(error) }
  return { error: null }
}

// 지금 로그인한 사람이 이 매물을 이미 찜했는지 (상세 화면 진입 시 하트 초기 상태 판단용)
export async function isFavorited(propertyId) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: false, error: null }

  const { data, error } = await supabase
    .from('favorites')
    .select('id')
    .eq('customer_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()
  if (error) return { data: false, error: toFriendlyError(error) }
  return { data: !!data, error: null }
}

// 내가 찜한 매물 id 목록만 (지도 화면에서 카드마다 하트 초기 상태를 한 번에 판단할 때 사용 - 매물마다 따로 조회하지 않도록)
export async function listMyFavoriteIds() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: [], error: null }

  const { data, error } = await supabase.from('favorites').select('property_id').eq('customer_id', user.id)
  if (error) return { data: [], error: toFriendlyError(error) }
  return { data: data.map((f) => f.property_id), error: null }
}

// 내가 찜한 매물 목록 (마이페이지) - 매물 사진/가격도 함께 가져옴
export async function listMyFavorites() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { data, error } = await supabase
    .from('favorites')
    .select('id, created_at, property:properties(id, title, address, deposit, monthly_rent, room_type, property_images(image_url, sort_order))')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}
