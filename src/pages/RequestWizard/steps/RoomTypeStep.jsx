export default function RoomTypeStep({ t, form, update }) {
  function toggle(code) {
    update({
      roomTypes: form.roomTypes.includes(code)
        ? form.roomTypes.filter((c) => c !== code)
        : [...form.roomTypes, code],
    })
  }

  return (
    <div className="rw-section">
      <div className="chip-group">
        {t.roomTypes.map((rt) => (
          <div
            key={rt.code}
            className={`chip${form.roomTypes.includes(rt.code) ? ' active' : ''}`}
            onClick={() => toggle(rt.code)}
          >
            {rt.label}
          </div>
        ))}
      </div>
    </div>
  )
}
