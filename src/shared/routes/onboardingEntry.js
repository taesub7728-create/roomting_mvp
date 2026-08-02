import { listMyRequests } from '../../api/requests.api'

export const ONBOARDING_SEEN_KEY = 'roomting_onboarding_seen_v1'

export function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'
  } catch {
    return false // 접근 차단 시 "처음 방문"으로 간주 - 무한 대기나 크래시보다 안전한 폴백
  }
}

export function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
  } catch {
    // 저장 실패해도 현재 세션의 완료 처리(이동)는 그대로 진행 - 다음 방문에 다시 노출될 뿐
  }
}

// pending_realtor는 폐기 예정인 레거시 role 값이지만(TODO_PHASE2.md 참고), MyPage.jsx가 이미
// 이 값을 customer와 동일하게 취급하고 있다(실제 심사 여부는 role이 아니라 realtor_applications
// 존재 여부로 별도 판단). 그 관례를 그대로 따른다.
export function isOnboardingEligibleRole(role) {
  return role === 'customer' || role === 'pending_realtor'
}

// listMyRequests()는 이미 created_at desc로 정렬돼 있으므로, open으로 필터링한 결과의
// 첫 번째 항목이 가장 최근에 생성된 open 요청서다(별도 정렬 로직을 추가하지 않는다).
// 조회 실패는 "open 요청서 없음"과 동일하게 취급한다 - 이 판단만으로 무한 대기하거나
// 별도 오류 화면을 만들지 않는다.
export async function findLatestOpenRequest() {
  const { data, error } = await listMyRequests()
  if (error || !data) return null
  return data.find((r) => r.status === 'open') || null
}
