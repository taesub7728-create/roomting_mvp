// 좌표 거리. 병합 임계값(1.5km) 판정과 merge_report 의 coord_spread_m 에 쓴다.

const EARTH_RADIUS_M = 6371008.8 // IUGG 평균 반지름

const toRad = (deg) => (deg * Math.PI) / 180

/** 두 좌표 사이 거리(m). 서울 규모에서 haversine 오차는 무시 가능하다. */
export function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * 좌표 묶음의 최대 상호 거리(m).
 *
 * ★ 평균이나 중심점 기준이 아니라 "가장 먼 두 점"이다.
 *   union-find로 A-B, B-C 가 각각 1.5km 이내라 한 덩어리가 되면 A-C 는 3km 일 수 있다.
 *   그 경우를 리포트에서 보이게 하려면 최대값이어야 한다.
 */
export function maxPairwiseMeters(points) {
  let max = 0
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = haversineMeters(points[i], points[j])
      if (d > max) max = d
    }
  }
  return max
}
