import { Calendar } from 'lucide-react'
import { getLocalTodayISO, isValidLocalISODate, isPastLocalDate, formatMoveInDate } from '../../../shared/format/moveInDate'

export default function MoveInStep({ t, lang, form, update }) {
  const dateValid = form.moveInDate.length > 0 && isValidLocalISODate(form.moveInDate)
  const dateIsPast = dateValid && isPastLocalDate(form.moveInDate)

  return (
    <>
      <div className="rw-section">
        <div className="rw-section-header">
          <label htmlFor="rw-move-in-date" className="rw-section-title">{t.moveinLabel}</label>
          <span className="rw-required">*</span>
        </div>

        {/* 네이티브 input은 opacity:0(포커스/스크린리더 접근 유지, display:none은 절대 쓰지 않음)로
            깔고 그 위에 언어별 표시 텍스트 + 장식용 아이콘을 pointer-events:none으로 덮는다.
            클릭은 항상 아래 네이티브 input으로 전달되므로 필드 어디를 눌러도 date picker가 열린다. */}
        <div className="date-field">
          <input
            id="rw-move-in-date"
            className="date-field-native"
            type="date"
            min={getLocalTodayISO()}
            value={form.moveInDate}
            onChange={(e) => update({ moveInDate: e.target.value })}
          />
          <div className="date-field-overlay">
            <span className={`date-field-text${dateValid ? '' : ' placeholder'}`}>
              {dateValid ? formatMoveInDate(lang, form.moveInDate) : t.moveInPlaceholder}
            </span>
            <Calendar size={16} strokeWidth={2} className="date-field-icon" aria-hidden="true" />
          </div>
        </div>

        {dateIsPast && <div className="rt-error-text">{t.moveInPastDateError}</div>}
      </div>

      <div className="rw-section">
        <div className="rw-section-header"><div className="rw-section-title">{t.contractLabel}</div></div>
        <div className="slider-card">
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--coral)' }}>{form.contractMonths}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', marginLeft: 2 }}>{t.contractUnit}</span>
          </div>
          <input
            className="rw-range"
            type="range"
            min={1}
            max={24}
            step={1}
            value={form.contractMonths}
            onChange={(e) => update({ contractMonths: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="rw-section">
        <div className="rw-section-header"><div className="rw-section-title">{t.registrationTitle}</div></div>
        <div className={`toggle-row${form.jeonip ? ' on' : ''}`} onClick={() => update({ jeonip: !form.jeonip })}>
          <div className="toggle-left">
            <div className="toggle-main">{t.jeonipMain}</div>
            <div className="toggle-desc">{t.jeonipDesc}</div>
          </div>
          <div className="rw-switch"></div>
        </div>
      </div>
    </>
  )
}
