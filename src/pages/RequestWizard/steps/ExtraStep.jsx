import { WashingMachine, Snowflake, SquareParking, PawPrint, Flame } from 'lucide-react'
import {
  EXTRA_NOTE_MAX_LENGTH,
  extraNoteLength,
  extraNoteOverBy,
} from '../validateExtraNote'

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

  const length = extraNoteLength(form.extraNote)
  const overBy = extraNoteOverBy(form.extraNote)

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
        className={`rw-textarea${overBy > 0 ? ' rw-textarea-over' : ''}`}
        placeholder={t.textareaPlaceholder}
        value={form.extraNote}
        maxLength={EXTRA_NOTE_MAX_LENGTH}
        onChange={(e) => update({ extraNote: e.target.value })}
      />

      {/* 카운터는 평상시 가장 낮은 위계다. 300자는 짧지 않아서 대부분의 사용자는
          이 숫자를 의식할 일이 없어야 한다 - 초과했을 때만 색과 문구로 올라온다. */}
      <div className={`rw-counter${overBy > 0 ? ' rw-counter-over' : ''}`}>
        {t.extraNoteCounter(length, EXTRA_NOTE_MAX_LENGTH)}
      </div>

      {/* 초과는 사용자가 타이핑해서 만들 수 없다(maxLength 가 막는다). 복원본이나 이 제한
          배포 이전 draft 를 재개한 경우에만 나타난다. 값을 자르지 않으므로 "몇 자를
          지워야 하는지"를 알려주는 것이 이 문구의 역할이다. */}
      {overBy > 0 && <div className="rt-error-text">{t.extraNoteOverLimitError(overBy)}</div>}
    </div>
  )
}
