import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { signOut } from '../../api/auth.api'

// AdminRoute.jsx에서 쓰던 "signOut 완료 판단 기준"을 그대로 재사용하기 위해 공통 훅으로 뺀 것.
// supabase.auth.signOut()의 Promise 완료만으로 로그아웃이 끝났다고 판단하지 않는다.
// signOut()이 세션을 지우는 것과, 그 결과가 onAuthStateChange를 통해 AuthProvider의
// user/profile 상태에 실제로 반영되는 것은 서로 다른 시점이기 때문에, 이 훅은 후자(AuthProvider
// 상태가 실제로 null이 된 시점)를 최종 완료 기준으로 삼는다.
//
// 사용법: const { isSigningOut, done, startSignOut } = useSignOutFlow()
//   - startSignOut()을 호출(버튼 클릭 등)해서 로그아웃을 시작
//   - isSigningOut === true인 동안은 보호된/의미 있는 콘텐츠를 렌더하지 않는 용도로 사용
//   - done === true가 되면 그때 원하는 곳으로 <Navigate>
const SIGNOUT_TIMEOUT_MS = 5000

export function useSignOutFlow() {
  const { user, profile } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [done, setDone] = useState(false)
  const timeoutRef = useRef(null)
  // state는 리액트가 배치 처리하므로 "같은 프레임 안의 중복 클릭"을 막기엔 신뢰할 수 없어
  // ref로 동기적으로 중복 트리거를 막는다(AdminRoute의 effect 트리거보다 버튼 클릭 트리거에 더 맞는 방식).
  const startedRef = useRef(false)

  function startSignOut() {
    if (startedRef.current) return
    startedRef.current = true
    setIsSigningOut(true)

    signOut().catch((err) => {
      console.error('signOut 실패:', err)
    })

    // signOut()이 실패하거나 onAuthStateChange가 예상만큼 빨리 안 오는 경우를 대비한 안전장치.
    // 이 시간이 지나도 AuthProvider의 user/profile이 null로 반영되지 않으면 강제로 완료 처리한다.
    timeoutRef.current = setTimeout(() => setDone(true), SIGNOUT_TIMEOUT_MS)
  }

  // "signOut() 요청이 끝났다"가 아니라 "AuthProvider의 user/profile이 실제로 null이 됐다"를
  // 로그아웃 완료 기준으로 삼는다 (onAuthStateChange의 SIGNED_OUT 이벤트가 반영된 시점).
  useEffect(() => {
    if (isSigningOut && !user && !profile) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setDone(true)
    }
  }, [isSigningOut, user, profile])

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  return { isSigningOut, done, startSignOut }
}
