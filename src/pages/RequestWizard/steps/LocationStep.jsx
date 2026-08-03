export default function LocationStep({ t, form, update }) {
  return (
    <div className="rw-section">
      <div className="rw-section-header">
        <div className="rw-section-title">{t.stationLabel}</div>
        <span className="rw-required">*</span>
      </div>
      <input
        className="rw-input"
        type="text"
        placeholder={t.stationPlaceholder}
        value={form.station}
        onChange={(e) => update({ station: e.target.value })}
      />
      <div className="chip-group">
        {t.stationChips.map((name) => (
          <div
            key={name}
            className={`chip${form.station === name ? ' active' : ''}`}
            onClick={() => update({ station: name })}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}
