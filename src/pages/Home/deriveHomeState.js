// 판정 우선순위: open 요청 중 최신 -> 없으면 전체 중 최신 -> 없으면 no_request.
// listMyRequests()는 이미 created_at desc로 정렬돼 있으므로 배열의 첫 항목이 곧 최신이다.
export function deriveHomeState(requests) {
  const latestOpen = requests.find((r) => r.status === 'open')
  if (latestOpen) {
    const count = Number(latestOpen.response_count ?? 0)
    return { status: count > 0 ? 'waiting' : 'waiting_empty', request: latestOpen }
  }
  const latestRequest = requests[0]
  if (latestRequest) return { status: 'closed', request: latestRequest }
  return { status: 'no_request', request: null }
}
