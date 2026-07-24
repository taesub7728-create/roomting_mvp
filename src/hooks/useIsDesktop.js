import { useEffect, useState } from 'react'

// 지정한 폭 이상이면 true. 파트너 대시보드처럼 PC에서 다른 레이아웃(테이블 등)을
// 보여줘야 하는 화면에서 사용.
export function useIsDesktop(breakpoint = 900) {
  const query = `(min-width: ${breakpoint}px)`
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return isDesktop
}
