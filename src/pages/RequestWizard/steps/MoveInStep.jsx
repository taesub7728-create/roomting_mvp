export default function MoveInStep({ t, form, update }) {
  return (
    <>
      <div className="rw-section">
        <div className="rw-section-header">
          <div className="rw-section-title">{t.moveinLabel}</div>
          <span className="rw-required">*</span>
        </div>
        <input
          className="date-input"
          type="date"
          value={form.moveInDate}
          onChange={(e) => update({ moveInDate: e.target.value })}
        />
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
