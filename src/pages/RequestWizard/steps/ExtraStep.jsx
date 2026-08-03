import { WashingMachine, Snowflake, SquareParking, PawPrint, Flame } from 'lucide-react'

const AMENITY_ICONS = {
  washer: WashingMachine,
  ac: Snowflake,
  parking: SquareParking,
  pet: PawPrint,
  full_option: Flame,
}

export default function ExtraStep({ t, form, update }) {
  function toggleAmenity(code) {
    update({
      amenities: form.amenities.includes(code)
        ? form.amenities.filter((a) => a !== code)
        : [...form.amenities, code],
    })
  }

  return (
    <div className="rw-section">
      <div className="chip-group" style={{ marginBottom: 6 }}>
        {t.amenities.map((a) => {
          const Icon = AMENITY_ICONS[a.code]
          return (
            <div
              key={a.code}
              className={`chip${form.amenities.includes(a.code) ? ' active' : ''}`}
              onClick={() => toggleAmenity(a.code)}
            >
              <Icon size={13} strokeWidth={2} style={{ marginRight: 5, verticalAlign: -2 }} />
              {a.label}
            </div>
          )
        })}
      </div>
      <textarea
        className="rw-textarea"
        placeholder={t.textareaPlaceholder}
        value={form.extraNote}
        onChange={(e) => update({ extraNote: e.target.value })}
      />
    </div>
  )
}
