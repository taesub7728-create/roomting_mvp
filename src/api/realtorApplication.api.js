import { supabase } from './supabaseClient'
import { toFriendlyError } from './errors'
import { safeFileName } from '../utils/safeFileName'

// 로그인/계정 생성 전에 호출 - 같은 유선전화번호로 이미 승인됐거나 심사중인 신청이 있는지 확인
export async function checkLandlineDuplicate(landlinePhone) {
  const { data, error } = await supabase.rpc('check_landline_duplicate', { phone: landlinePhone })
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null } // data: boolean (true면 이미 등록된 업체)
}

async function uploadDocument(userId, file) {
  const path = `${userId}/${safeFileName(file)}`
  const { error } = await supabase.storage.from('realtor-documents').upload(path, file)
  if (error) return { path: null, error: toFriendlyError(error) }
  return { path, error: null }
}

// 공인중개사·에이전트 지원서 제출: 사업자등록증/중개등록증을 비공개 버킷에 올리고, 지원 정보를 저장
// 이 시점엔 이미 회원가입이 끝난 상태(role은 customer로 생성됨)라 로그인 세션이 있어야 함
// 승인 전까지는 role이 customer로 유지되고, "심사중" 여부는 이 지원서 존재 여부로 판단함(getMyRealtorApplication 참고)
export async function submitRealtorApplication({
  companyName,
  businessRegistrationNumber,
  contactName,
  contactPhone,
  landlinePhone,
  brokerRegistrationNumber,
  companyAddress,
  businessDocumentFile,
  brokerDocumentFile,
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: '로그인이 필요합니다.' }

  const { path: businessDocPath, error: businessUploadError } = await uploadDocument(user.id, businessDocumentFile)
  if (businessUploadError) return { data: null, error: businessUploadError }

  const { path: brokerDocPath, error: brokerUploadError } = await uploadDocument(user.id, brokerDocumentFile)
  if (brokerUploadError) return { data: null, error: brokerUploadError }

  // realtor-documents는 비공개 버킷이라 공개 URL이 없음 - 파일 경로만 저장해두고, 나중에(관리자 검토 화면 등)
  // supabase.storage.from('realtor-documents').createSignedUrl(path, 초) 로 그때그때 임시 URL을 발급해서 봄
  const { data, error } = await supabase
    .from('realtor_applications')
    .insert({
      profile_id: user.id,
      company_name: companyName,
      business_registration_number: businessRegistrationNumber,
      contact_name: contactName,
      contact_phone: contactPhone,
      landline_phone: landlinePhone,
      broker_registration_number: brokerRegistrationNumber,
      company_address: companyAddress,
      document_path: businessDocPath,
      broker_registration_document_path: brokerDocPath,
    })
    .select()
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 로그인한 본인이 이미 제출한 지원서가 있는지 (파트너 대시보드에서 "심사중" 화면을 보여줄지 판단할 때 사용)
// role은 이제 가입 시 항상 customer로 생성되므로, "심사중" 여부는 role이 아니라 지원서 존재 여부로 판단한다
export async function getMyRealtorApplication() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: null }

  const { data, error } = await supabase
    .from('realtor_applications')
    .select('id, created_at')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 운영자 페이지: 지원서 전체 목록 (현재 role도 같이 가져와서 이미 승인됐는지 화면에서 알 수 있게)
export async function listRealtorApplications() {
  const { data, error } = await supabase
    .from('realtor_applications')
    .select('*, profile:profiles!profile_id(role)')
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}

// 비공개 버킷의 서류를 잠깐(5분) 볼 수 있는 임시 URL 발급
export async function getApplicationDocumentUrl(path) {
  const { data, error } = await supabase.storage.from('realtor-documents').createSignedUrl(path, 300)
  if (error) return { data: null, error: toFriendlyError(error) }
  return { data: data.signedUrl, error: null }
}

// 승인 실패를 운영자가 읽을 수 있는 문장으로 바꾼다.
//
// ★ migration_028 의 approve_realtor_application() 이 실제로 던지는 코드만 다룬다.
//   42501 admin 아님 / 23514 영업지역 비어 있음 / 23503 프로필 없음 또는 district_code FK 위반
//   함수 본문에 없는 코드를 미리 넣어 두면 "처리한 것처럼 보이는" 죽은 분기가 된다.
function toApproveError(error) {
  if (!error) return null

  if (error.code === '42501') {
    return '승인 권한이 없습니다. 관리자 계정으로 다시 로그인해주세요.'
  }
  if (error.code === '23514') {
    return '영업지역을 최소 1개 선택해야 승인할 수 있습니다.'
  }
  if (error.code === '23503') {
    // 함수가 두 곳에서 이 코드를 쓴다 - 프로필을 못 찾은 경우와 district_code FK 위반.
    // 메시지 문자열로 갈라 짚어준다(둘 다 admin 이 확인해야 하는 항목이라 구분이 의미 있다).
    if (error.message?.includes('profile not found')) {
      return '해당 계정을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해주세요.'
    }
    return '선택한 영업지역 코드가 올바르지 않습니다. 다시 선택해주세요.'
  }

  return toFriendlyError(error)
}

// 지원서를 승인한다. role 변경과 영업지역 부여가 한 트랜잭션으로 처리된다.
//
// ★ profiles.role 을 직접 UPDATE 하던 구경로는 삭제했다(2026-08-10).
//   migration_030:11-14 가 "구경로는 코드에서 삭제되어 있어야 한다"를 적용 전제로 요구한다.
//   구경로로 승인하면 realtor_service_areas 에 행이 없는 중개사가 만들어지고, 029/030 적용
//   후 그 중개사는 에러 없이 요청서 0건을 보게 된다 - 발견이 가장 어려운 형태의 고장이다.
//
// districtCodes: 시군구 코드 배열. 빈 배열이면 RPC 가 23514 로 거부한다.
export async function approveRealtorApplication(profileId, districtCodes) {
  const { error } = await supabase.rpc('approve_realtor_application', {
    p_profile_id: profileId,
    p_district_codes: districtCodes,
  })

  if (error) return { error: toApproveError(error) }
  return { error: null }
}
