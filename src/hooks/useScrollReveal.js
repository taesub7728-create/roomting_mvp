import { useEffect, useRef, useState } from 'react'

// 요소가 뷰포트에 처음 들어올 때 한 번만 true로 바뀜(재실행 없음).
// 마크업 쪽에서 className={`reveal${visible ? ' visible' : ''}`} 형태로 사용하고,
// 실제 등장 애니메이션(opacity/transform)은 각 컴포넌트 CSS의 트랜지션으로 처리한다.
// prefers-reduced-motion인 경우 관찰 없이 바로 true(콘텐츠가 숨겨진 채 남지 않도록).
export function useScrollReveal(threshold = 0.2) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, visible]
}
