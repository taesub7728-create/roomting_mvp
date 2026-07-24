// 카카오맵 JS SDK를 <script> 태그로 동적 로드. 여러 화면에서 호출해도 한 번만 로드됨.
let loadPromise = null

export function loadKakaoMaps() {
  const appKey = import.meta.env.VITE_KAKAO_MAP_API_KEY
  if (!appKey) return Promise.reject(new Error('VITE_KAKAO_MAP_API_KEY가 설정되지 않았어요'))

  if (window.kakao?.maps) return Promise.resolve(window.kakao)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao))
    script.onerror = () => {
      loadPromise = null
      reject(new Error('카카오맵 SDK 로드에 실패했어요'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

// 입력한 텍스트로 주소 후보를 검색 (운영자 페이지의 주소 자동완성에서 사용)
// 일치하는 주소가 없으면 빈 배열을 반환 (검색 중 흔한 상황이라 에러로 취급하지 않음)
export async function searchAddressCandidates(query) {
  const kakao = await loadKakaoMaps()
  return new Promise((resolve, reject) => {
    const geocoder = new kakao.maps.services.Geocoder()
    geocoder.addressSearch(query, (result, status) => {
      if (status === kakao.maps.services.Status.ERROR) {
        reject(new Error('주소 검색에 실패했어요.'))
        return
      }
      if (status !== kakao.maps.services.Status.OK) {
        resolve([])
        return
      }
      resolve(
        result.slice(0, 5).map((r) => ({
          label: r.road_address?.address_name || r.address_name,
          lat: Number(r.y),
          lng: Number(r.x),
        }))
      )
    })
  })
}
