import { getMyRealtorApplication } from '../../api/realtorApplication.api'

// customer role인 사용자가 realtor 지원서를 제출해 심사 대기 중인지 확인.
// (이건 realtor 비즈니스 로직이 아니라 접근 권한 판단 로직이라 shared/auth에 둔다)
// role 자체에 따른 분기(realtor/admin/care_agent 등)는 RealtorRoute가 직접 처리하고,
// 이 함수는 "customer인 경우에 한해" 추가로 필요한 비동기 판단 하나만 책임진다.
export async function hasPendingRealtorApplication() {
  const { data } = await getMyRealtorApplication()
  return !!data
}
