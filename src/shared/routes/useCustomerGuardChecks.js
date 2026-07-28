import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { hasPendingRealtorApplication } from '../auth/realtorStatus'

// CustomerRoute(완전 비공개)와 PublicCustomerRoute(비로그인은 통과, 로그인 사용자만 체크)가
// 공유하는 "customer 권한/심사 상태" 체크 로직.
//
// profile.id가 바뀔 때만(=다른 사용자로 로그인/로그아웃될 때만) 재조회한다.
export function useCustomerGuardChecks() {
  const { user, profile, authLoading, profileLoading } = useAuth()
  const [checkingPending, setCheckingPending] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(null) // true/false로 확정되기 전까지 null

  useEffect(() => {
    if (profile?.role !== 'customer') {
      setCheckingPending(false)
      setPendingStatus(null)
      return
    }

    let cancelled = false
    setCheckingPending(true)
    setPendingStatus(null)
    hasPendingRealtorApplication().then((result) => {
      if (cancelled) return
      setPendingStatus(result)
      setCheckingPending(false)
    })
    return () => { cancelled = true }
  }, [profile?.id])

  return { user, profile, authLoading, profileLoading, checkingPending, pendingStatus }
}
