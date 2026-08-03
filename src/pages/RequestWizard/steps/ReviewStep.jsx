import { formatKrwAmount } from '../../../shared/format/krwAmount'

function SummaryRow({ label, value, warning, editLabel, onEdit }) {
  return (
    <div className={`review-row${warning ? ' review-row-warning' : ''}`}>
      <div className="review-row-label">{label}</div>
      <div className={`review-row-value${warning ? ' warning' : ''}`}>{value}</div>
      <button type="button" className="review-edit-btn" onClick={onEdit}>{editLabel}</button>
    </div>
  )
}

export default function ReviewStep({ t, lang, form, onEditStep }) {
  const isJeonse = form.dealType === 'jeonse'

  const roomTypeLabel =
    form.roomTypes.map((code) => t.roomTypes.find((rt) => rt.code === code)?.label ?? code).join(', ') ||
    t.noneValue

  const amenityLabel = form.amenities
    .map((code) => t.amenities.find((a) => a.code === code)?.label ?? code)
    .join(', ')

  const extraValue = [amenityLabel, form.extraNote.trim()].filter(Boolean).join(' · ') || t.noneValue

  const dealValue = isJeonse
    ? form.jeonseDepositMin != null
      ? t.jeonseDepositRangeText(formatKrwAmount(form.jeonseDepositMin, lang), formatKrwAmount(form.jeonseDepositMax, lang))
      : t.jeonseDepositMaxOnlyText(formatKrwAmount(form.jeonseDepositMax, lang))
    : `${t.depositLabel} ${form.deposit.toLocaleString()}${t.depositUnit} ${t.maxSuffix} / ${t.rentLabel} ${form.rent}${t.rentUnit} ${t.maxSuffix}`

  const loanMissing = isJeonse && form.jeonseLoanPlanned == null
  const loanValue = loanMissing
    ? t.reviewJeonseLoanMissing
    : form.jeonseLoanPlanned
      ? (form.jeonseLoanDetail ? `${t.jeonseLoanYes} · ${form.jeonseLoanDetail}` : t.jeonseLoanYes)
      : t.jeonseLoanNo

  return (
    <div className="rw-section">
      <div className="autosave-notice">{t.autosaveNotice}</div>

      <SummaryRow label={t.reviewLocationLabel} value={form.station || t.noneValue} editLabel={t.editLabel} onEdit={() => onEditStep('location')} />
      <SummaryRow label={t.reviewDealTypeLabel} value={dealValue} editLabel={t.editLabel} onEdit={() => onEditStep('transaction')} />
      <SummaryRow label={t.reviewRoomTypeLabel} value={roomTypeLabel} editLabel={t.editLabel} onEdit={() => onEditStep('room_type')} />
      <SummaryRow label={t.reviewRegistrationLabel} value={form.jeonip ? t.registrationYes : t.registrationNo} editLabel={t.editLabel} onEdit={() => onEditStep('move_in')} />
      <SummaryRow label={t.reviewMoveInLabel} value={form.moveInDate || t.noneValue} editLabel={t.editLabel} onEdit={() => onEditStep('move_in')} />
      <SummaryRow label={t.reviewContractLabel} value={`${form.contractMonths}${t.contractUnit}`} editLabel={t.editLabel} onEdit={() => onEditStep('move_in')} />
      <SummaryRow label={t.reviewExtraLabel} value={extraValue} editLabel={t.editLabel} onEdit={() => onEditStep('extra')} />

      {isJeonse && (
        <SummaryRow
          label={t.reviewJeonseLoanLabel}
          value={loanMissing ? t.reviewJeonseLoanMissing : loanValue}
          warning={loanMissing}
          editLabel={loanMissing ? t.reviewJeonseLoanFillIn : t.editLabel}
          onEdit={() => onEditStep('transaction')}
        />
      )}

      {loanMissing && <div className="rt-error-text">{t.reviewJeonseLoanMissingNotice}</div>}
    </div>
  )
}
