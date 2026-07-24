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
// 이 시점엔 이미 role='pending_realtor'로 회원가입이 끝난 상태라 로그인 세션이 있어야 함
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

// 지원서를 승인해서 role을 realtor로 바꿈
export async function approveRealtorApplication(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: 'realtor' })
    .eq('id', profileId)
    .select()
    .single()

  if (error) return { data: null, error: toFriendlyError(error) }
  return { data, error: null }
}
