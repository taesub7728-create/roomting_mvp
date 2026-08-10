import { useEffect, useRef, useState } from 'react'
import { searchStations } from '../../../api/stations.api'

// 역 자동완성 입력.
//
// ★ station_id 는 목록에서 고른 순간에만 생긴다.
//   사용자가 입력칸을 직접 고치면 즉시 지운다. 그러지 않으면 "홍대입구를 골랐다가 강남으로
//   고쳐 쓴" 요청서가 홍대입구 station_id 를 달고 저장된다.
//
// ★ 검색이 실패해도 마법사를 멈추지 않는다. 인라인 상태로만 알리고 입력값은 그대로 둔다.
//   027 트리거가 station_id 없는 요청서를 통과시키므로 자유 입력으로도 제출할 수 있다.

const DEBOUNCE_MS = 280
const MIN_QUERY_LENGTH = 1
const RESULT_LIMIT = 8

export default function StationAutocomplete({ t, form, update }) {
  // idle | loading | results | empty | error
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState([])
  const [highlighted, setHighlighted] = useState(-1)
  const [open, setOpen] = useState(false)

  // 사용자가 입력칸을 만진 뒤에만 검색한다. draft 복원 직후 목록이 저절로 열리지 않게 한다.
  const dirtyRef = useRef(false)
  // 최신 요청만 화면에 반영하기 위한 토큰. '홍' -> '홍대' -> '홍대입' 을 빠르게 칠 때
  // 먼저 보낸 요청이 늦게 도착해 최신 결과를 덮어쓰는 것을 막는다.
  const seqRef = useRef(0)
  const abortRef = useRef(null)
  const listRef = useRef(null)
  const wrapRef = useRef(null)

  const query = form.station

  useEffect(() => {
    if (!dirtyRef.current) return

    const text = query.trim()
    if (text.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort()
      seqRef.current += 1
      setResults([])
      setStatus('idle')
      setOpen(false)
      return
    }

    setStatus('loading')
    setOpen(true)

    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const seq = seqRef.current + 1
      seqRef.current = seq

      searchStations(text, { limit: RESULT_LIMIT, signal: controller.signal })
        .then(({ data, error, aborted }) => {
          // 늦게 도착한 이전 요청의 응답은 버린다.
          if (seq !== seqRef.current || aborted) return
          if (error) { setStatus('error'); setResults([]); return }
          setResults(data)
          setHighlighted(data.length > 0 ? 0 : -1)
          setStatus(data.length > 0 ? 'results' : 'empty')
        })
        .catch(() => {
          if (seq !== seqRef.current) return
          setStatus('error')
          setResults([])
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  // 바깥을 누르면 닫는다. 선택은 취소하지 않는다(입력값과 station_id 를 그대로 둔다).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (highlighted < 0 || !listRef.current) return
    listRef.current.children[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  function handleInput(value) {
    dirtyRef.current = true
    // ★ 텍스트를 직접 고치면 선택은 무효다.
    update({ station: value, stationId: null })
  }

  function handleSelect(item) {
    abortRef.current?.abort()
    seqRef.current += 1
    update({ station: item.nameKo, stationId: item.stationId })
    setOpen(false)
    setResults([])
    setStatus('idle')
    setHighlighted(-1)
  }

  function handleChip(name) {
    dirtyRef.current = true
    // 칩은 텍스트만 채운다. station_id 는 목록에서 고를 때만 생긴다.
    update({ station: name, stationId: null })
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown' && results.length > 0) { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && highlighted < results.length) {
        e.preventDefault()
        handleSelect(results[highlighted])
      }
    }
  }

  const selected = form.stationId != null

  // 텍스트는 있는데 고르지는 않은 상태. 이 상태로는 다음 단계로 갈 수 없으므로 이유를 알린다.
  //
  // 이 한 줄이 두 경우를 같이 덮는다:
  //   - 직접 타이핑만 하고 목록을 안 고른 경우
  //   - 자동완성 도입 이전 draft 를 재개한 경우(station 텍스트만 있고 stationId 가 없다)
  // 후자를 특별 취급하지 않는 이유: 사용자가 해야 할 일이 "목록에서 고르기"로 똑같다.
  const needsPick = !selected && form.station.trim().length > 0

  return (
    <div className="rw-section">
      <div className="rw-section-header">
        <div className="rw-section-title">{t.stationLabel}</div>
        <span className="rw-required">*</span>
      </div>

      <div className="station-ac" ref={wrapRef}>
        <input
          className={`rw-input${selected ? ' station-ac-selected' : ''}`}
          type="text"
          placeholder={t.stationPlaceholder}
          value={form.station}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="station-ac-list"
          aria-autocomplete="list"
        />

        {selected && <div className="station-ac-hint">{t.stationSelectedHint}</div>}
        {needsPick && <div className="station-ac-hint station-ac-hint-pick">{t.stationPickFromListHint}</div>}

        {open && (
          <div className="station-ac-panel">
            {status === 'loading' && <div className="station-ac-msg">{t.stationSearching}</div>}
            {status === 'empty' && <div className="station-ac-msg">{t.stationNoResults}</div>}
            {status === 'error' && <div className="station-ac-msg station-ac-msg-error">{t.stationSearchError}</div>}
            {status === 'results' && (
              <ul className="station-ac-list" id="station-ac-list" role="listbox" ref={listRef}>
                {results.map((item, i) => (
                  <li
                    key={item.stationId}
                    role="option"
                    aria-selected={i === highlighted}
                    className={`station-ac-item${i === highlighted ? ' active' : ''}`}
                    onMouseEnter={() => setHighlighted(i)}
                    // onMouseDown: input 의 blur 보다 먼저 잡아야 선택이 취소되지 않는다.
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
                  >
                    <span className="station-ac-name">{item.nameKo}</span>
                    {item.lineNames.length > 0 && (
                      <span className="station-ac-lines">{item.lineNames.join(' · ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="chip-group">
        {t.stationChips.map((name) => (
          <div
            key={name}
            className={`chip${form.station === name ? ' active' : ''}`}
            onClick={() => handleChip(name)}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}
