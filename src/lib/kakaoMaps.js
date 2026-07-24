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
