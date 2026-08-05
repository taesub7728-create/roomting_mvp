import { parseAmountInput, formatKrwAmount } from '../../../shared/format/krwAmount'
import { checkJeonseAmounts, TRANSACTION_ISSUE } from '../validateTransaction'
import { TRANSACTION_ISSUE_MESSAGE_KEY } from '../translations'

export default function TransactionStep({ t, lang, form, update }) {
  const isJeonse = form.dealType === 'jeonse'

  // 금액 위반은 그 자리에서 이유를 알려준다. 단 DEPOSIT_MAX_MISSING(아직 아무것도 입력하지
  // 않은 상태)만 예외로 무표시 - 전세 탭을 연 직후 빈 폼에 빨간 에러가 뜨는 것을 막는다.
  // 필수라는 사실은 라벨의 * 표시와 비활성 "다음" 버튼이 이미 전달한다.
  //
  // 전세자금대출 미선택(checkJeonseLoanPlan)은 여기서 표시하지 않는다 - 이 단계에서는
  // 막지 않고 review 단계에서만 안내한다는 기존 정책을 그대로 유지한다.
  const amountIssue = checkJeonseAmounts(form)
  const amountIssueText =
    amountIssue && amountIssue !== TRANSACTION_ISSUE.DEPOSIT_MAX_MISSING
      ? t[TRANSACTION_ISSUE_MESSAGE_KEY[amountIssue]]
      : null

  return (
    <>
      <div className="rw-section">
        <div className="rw-section-header"><div className="rw-section-title">{t.dealTypeLabel}</div></div>
        <div className="deal-type-toggle">
          <button
            type="button"
            className={`deal-type-btn${!isJeonse ? ' active' : ''}`}
            onClick={() => update({ dealType: 'rent' })}
          >
            {t.dealTypeRent}
          </button>
          <button
            type="button"
            className={`deal-type-btn${isJeonse ? ' active' : ''}`}
            onClick={() => update({ dealType: 'jeonse' })}
          >
            {t.dealTypeJeonse}
          </button>
        </div>
      </div>

      {!isJeonse && (
        <div className="rw-section">
          <div className="slider-card">
            <div className="rw-section-sub" style={{ marginBottom: 10 }}>{t.rentLabel}</div>
            <div className="slider-display">
              <span className="slider-value">{form.rent}</span>
              <span className="slider-unit">{t.rentUnit}</span>
            </div>
            <input className="rw-range" type="range" min={20} max={300} step={10} value={form.rent} onChange={(e) => update({ rent: Number(e.target.value) })} />
            <div className="range-labels"><span>{t.rentRangeLabels[0]}</span><span>{t.rentRangeLabels[1]}</span></div>
          </div>

          <div className="slider-card">
            <div className="rw-section-sub" style={{ marginBottom: 10 }}>{t.depositLabel}</div>
            <div className="slider-display">
              <span className="slider-value">{form.deposit.toLocaleString()}</span>
              <span className="slider-unit">{t.depositUnit}</span>
            </div>
            <input className="rw-range" type="range" min={0} max={5000} step={100} value={form.deposit} onChange={(e) => update({ deposit: Number(e.target.value) })} />
            <div className="range-labels"><span>{t.depositRangeLabels[0]}</span><span>{t.depositRangeLabels[1]}</span></div>
          </div>
        </div>
      )}

      {isJeonse && (
        <div className="rw-section">
          <div className="rw-section-header"><div className="rw-section-title">{t.jeonseDepositTitle}</div></div>

          <div className="amount-input-card">
            <div className="rw-section-sub" style={{ marginBottom: 8 }}>{t.jeonseDepositMinLabel}</div>
            <div className="amount-input-row">
              <input
                className="rw-input amount-input"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={form.jeonseDepositMin ?? ''}
                onChange={(e) => update({ jeonseDepositMin: parseAmountInput(e.target.value) })}
              />
              <span className="amount-input-unit">{t.jeonseDepositInputUnit}</span>
            </div>
            {form.jeonseDepositMin != null && (
              <div className="amount-preview">= {formatKrwAmount(form.jeonseDepositMin, lang)}</div>
            )}
          </div>

          <div className="amount-input-card">
            <div className="rw-section-sub" style={{ marginBottom: 8 }}>
              {t.jeonseDepositMaxLabel} <span style={{ color: 'var(--coral)' }}>*</span>
            </div>
            <div className="amount-input-row">
              <input
                className="rw-input amount-input"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={form.jeonseDepositMax ?? ''}
                onChange={(e) => update({ jeonseDepositMax: parseAmountInput(e.target.value) })}
              />
              <span className="amount-input-unit">{t.jeonseDepositInputUnit}</span>
            </div>
            {form.jeonseDepositMax != null && (
              <div className="amount-preview">= {formatKrwAmount(form.jeonseDepositMax, lang)}</div>
            )}
          </div>

          {amountIssueText && <div className="rt-error-text">{amountIssueText}</div>}
        </div>
      )}

      {isJeonse && (
        <div className="rw-section">
          <div className="rw-section-header"><div className="rw-section-title">{t.jeonseLoanTitle}</div></div>
          <div className="deal-type-toggle">
            <button
              type="button"
              className={`deal-type-btn${form.jeonseLoanPlanned === true ? ' active' : ''}`}
              onClick={() => update({ jeonseLoanPlanned: true })}
            >
              {t.jeonseLoanYes}
            </button>
            <button
              type="button"
              className={`deal-type-btn${form.jeonseLoanPlanned === false ? ' active' : ''}`}
              onClick={() => update({ jeonseLoanPlanned: false, jeonseLoanDetail: '' })}
            >
              {t.jeonseLoanNo}
            </button>
          </div>

          {form.jeonseLoanPlanned === true && (
            <div style={{ marginTop: 12 }}>
              <div className="rw-section-sub" style={{ marginBottom: 8 }}>{t.jeonseLoanDetailLabel}</div>
              <input
                className="rw-input"
                type="text"
                placeholder={t.jeonseLoanDetailPlaceholder}
                value={form.jeonseLoanDetail}
                onChange={(e) => update({ jeonseLoanDetail: e.target.value })}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
