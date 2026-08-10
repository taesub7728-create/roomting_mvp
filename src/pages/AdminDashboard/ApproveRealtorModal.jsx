import { useEffect, useMemo, useState } from 'react'
import { listDistricts, SEOUL_SIDO_CODE } from '../../api/districts.api'

// 중개사 승인 모달. 영업지역을 고르지 않으면 승인할 수 없다.
//
// ★ 영업지역 상한은 프론트 UI 제한이다.
//   approve_realtor_application() 도 realtor_service_areas 의 CHECK 도 개수를 검사하지
//   않는다. SQL Editor 나 RPC 직접 호출로는 상한을 넘길 수 있고, 그것은 의도된 상태다
//   (운영자가 예외를 만들 수 있어야 한다). DB 에 상한을 박으면 구독 등급별 차등이나
//   사무실 단위 예외를 넣을 때 migration 이 필요해진다.
export const MAX_SERVICE_AREAS = 3

export default function ApproveRealtorModal({ application, onCancel, onConfirm }) {
  const [districts, setDistricts] = useState([])
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // 프리필이 상한을 넘어 잘렸을 때만 알린다.
  const [prefillTrimmed, setPrefillTrimmed] = useState(false)

  useEffect(() => {
    let alive = true
    listDistricts().then(({ data, error: loadError }) => {
      if (!alive) return
      if (loadError) { setError(loadError); setLoading(false); return }
      setDistricts(data)

      // desired_district_codes 프리필. 신청 화면에 입력 UI 가 아직 없어 현재는 전부 NULL 이지만,
      // 값이 들어오기 시작해도 화면이 그대로 동작하도록 지금 처리해 둔다.
      //
      // ★ 실재하는 코드만 남긴다. 오래된 코드나 오타가 섞여 있으면 조용히 버린다 -
      //   그대로 선택 상태로 두면 승인 시점에 23503 으로 실패하고 원인이 화면에 안 보인다.
      const desired = Array.isArray(application?.desired_district_codes) ? application.desired_district_codes : []
      const valid = desired.filter((code) => data.some((d) => d.code === code))
      if (valid.length > MAX_SERVICE_AREAS) setPrefillTrimmed(true)
      setSelected(valid.slice(0, MAX_SERVICE_AREAS))
      setLoading(false)
    })
    return () => { alive = false }
  }, [application])

  const atLimit = selected.length >= MAX_SERVICE_AREAS

  // 검색어가 없으면 서울 25개만 보여준다. 대부분의 승인이 서울이라 기본 화면을 짧게 유지한다.
  // 검색어가 있으면 전국 256개를 대상으로 찾는다.
  const visible = useMemo(() => {
    const text = query.trim()
    if (!text) return districts.filter((d) => d.sido_code === SEOUL_SIDO_CODE)
    return districts.filter((d) => d.name_ko.includes(text) || d.code.startsWith(text))
  }, [districts, query])

  const selectedDistricts = useMemo(
    () => selected.map((code) => districts.find((d) => d.code === code)).filter(Boolean),
    [selected, districts],
  )

  function toggle(code) {
    setSelected((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code)
      if (prev.length >= MAX_SERVICE_AREAS) return prev
      return [...prev, code]
    })
  }

  async function handleConfirm() {
    if (selected.length === 0) return
    setSubmitting(true)
    setError(null)
    // onConfirm 은 실패를 throw 하지 않고 에러 문자열을 돌려준다.
    // 모달이 스스로 에러를 표시해야 사용자가 선택을 잃지 않는다.
    const message = await onConfirm(selected)
    if (message) { setError(message); setSubmitting(false); return }
    // 성공하면 부모가 모달을 닫는다.
  }

  return (
    <div className="ad-modal-overlay" onClick={submitting ? undefined : onCancel}>
      <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ad-modal-title">{application.company_name} 승인</div>
        <div className="ad-modal-desc">
          영업지역을 선택하면 승인됩니다. 이 지역의 요청서만 이 중개사에게 전달돼요.
        </div>

        <div className="ad-modal-section-head">
          <span className="ad-modal-label">영업지역</span>
          <span className={`ad-modal-count${atLimit ? ' at-limit' : ''}`}>
            {selected.length}/{MAX_SERVICE_AREAS}
          </span>
        </div>
        <div className="ad-modal-hint">최대 {MAX_SERVICE_AREAS}개까지 선택할 수 있습니다.</div>

        {prefillTrimmed && (
          <div className="ad-modal-hint ad-modal-hint-warn">
            신청서에 희망 지역이 {MAX_SERVICE_AREAS}개를 넘게 적혀 있어 앞 {MAX_SERVICE_AREAS}개만 선택했어요.
          </div>
        )}

        {selectedDistricts.length > 0 && (
          <div className="ad-modal-selected">
            {selectedDistricts.map((d) => (
              <button key={d.code} type="button" className="ad-modal-chip selected" onClick={() => toggle(d.code)}>
                {d.name_ko} ✕
              </button>
            ))}
          </div>
        )}

        <input
          className="rt-input ad-modal-search"
          type="text"
          placeholder="지역 검색 (기본: 서울 25개 구)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading || submitting}
        />

        <div className="ad-modal-list">
          {loading && <div className="ad-modal-empty">지역을 불러오는 중...</div>}
          {!loading && visible.length === 0 && <div className="ad-modal-empty">검색 결과가 없어요</div>}
          {!loading && visible.map((d) => {
            const isSelected = selected.includes(d.code)
            return (
              <button
                key={d.code}
                type="button"
                className={`ad-modal-chip${isSelected ? ' selected' : ''}`}
                // 상한에 도달하면 이미 고른 것만 누를 수 있다(해제는 언제나 가능해야 한다).
                disabled={submitting || (!isSelected && atLimit)}
                onClick={() => toggle(d.code)}
              >
                {d.name_ko}
              </button>
            )
          })}
        </div>

        {error && <div className="rt-error-text ad-modal-error">{error}</div>}

        <div className="ad-modal-actions">
          <button type="button" className="rt-btn-secondary" onClick={onCancel} disabled={submitting}>
            취소
          </button>
          <button
            type="button"
            className="rt-btn-primary"
            onClick={handleConfirm}
            disabled={submitting || selected.length === 0}
          >
            {submitting ? '승인하는 중...' : '승인하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
