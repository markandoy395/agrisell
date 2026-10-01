import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchPaymentDetail, savePaymentAction } from '../../api/payments'
import { getApiErrorMessage } from '../../api/adminAuth'
import { Icon } from '../../components/ui/icon/Icon'
import type { PaymentDetail, PaymentRecord } from '../../types/dashboard'

type Action = 'verify' | 'settlement' | 'payout' | 'refund' | 'dispute' | 'failed'
type Props = {
  payment: PaymentRecord
  onClose: () => void
  onSaved: () => Promise<void>
  onNotice: (message: string) => void
}

const labels: Record<Action, string> = {
  verify: 'Verify payment',
  settlement: 'Settlement',
  payout: 'Farmer payout',
  refund: 'Refund',
  dispute: 'Dispute',
  failed: 'Failed payment',
}

const decisions: Record<Action, { value: string; label: string }[]> = {
  verify: [
    { value: 'verified', label: 'Verify funds received' },
    { value: 'rejected', label: 'Reject verification' },
  ],
  settlement: [
    { value: 'approved', label: 'Approve settlement' },
    { value: 'settled', label: 'Mark settled' },
  ],
  payout: [
    { value: 'approved', label: 'Approve payout' },
    { value: 'paid', label: 'Mark payout paid' },
    { value: 'failed', label: 'Mark payout failed' },
  ],
  refund: [
    { value: 'approved', label: 'Approve refund' },
    { value: 'completed', label: 'Mark refund completed' },
    { value: 'failed', label: 'Mark refund failed' },
  ],
  dispute: [
    { value: 'open', label: 'Open dispute and hold funds' },
    { value: 'resolved', label: 'Resolve dispute' },
  ],
  failed: [
    { value: 'retry_requested', label: 'Request payment retry' },
    { value: 'resolved', label: 'Resolve failure' },
  ],
}

const money = (value: unknown) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) || 0)

const readableValue = (value: unknown, fallback = 'None') => {
  if (typeof value !== 'string' || !value.trim()) return fallback
  return value.replaceAll('_', ' ')
}

const formatPaymentDate = (value?: string) => {
  if (!value) return { date: 'Not recorded', time: '' }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return { date: value, time: '' }
  const date = new Date(timestamp)
  return {
    date: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date),
  }
}

export function PaymentManagementPanel({ payment, onClose, onSaved, onNotice }: Props) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState<Action>('verify')
  const [decision, setDecision] = useState('verified')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState('customer_favored')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    fetchPaymentDetail(payment.id, controller.signal)
      .then((value) => {
        setDetail(value)
        setAmount(String(value.payment.amount ?? ''))
        if (value.payment.verification_status === 'verified') {
          setAction('settlement')
          setDecision('approved')
        }
        if (['failed', 'rejected'].includes(value.payment.payment_status)) {
          setAction('failed')
          setDecision('retry_requested')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(getApiErrorMessage(cause, 'Payment details could not be loaded.'))
      })
    return () => controller.abort()
  }, [payment.id])

  const chooseAction = (next: Action) => {
    setAction(next)
    setDecision(decisions[next][0].value)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!detail || !reason.trim()) return
    setSaving(true)
    setError('')
    try {
      const updated = await savePaymentAction({
        action,
        decision,
        payment_id: detail.payment.payment_id,
        previous_version: detail.payment.version,
        command_id: crypto.randomUUID(),
        reason: reason.trim(),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(['payout', 'refund'].includes(action) ? { amount: Number(amount) } : {}),
        ...(action === 'dispute' && decision === 'resolved' ? { outcome } : {}),
      })
      setDetail(updated)
      setReason('')
      setReference('')
      await onSaved()
      onNotice(`${labels[action]} saved with an audit entry.`)
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'The financial operation could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  const paymentDate = formatPaymentDate(payment.paidAt || payment.time)
  const statusTone = payment.status.toLowerCase()

  return (
    <div className="payment-management-backdrop" onMouseDown={onClose}>
      <section
        className="payment-management-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-management-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="payment-management-header">
          <div>
            <h2 id="payment-management-title">Manage Payment</h2>
            <p>Update the status and record your action for this payment.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close payment operations">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="payment-management-identity">
          <div className="payment-management-payment">
            <span className="payment-management-document-icon">
              <Icon name="document" size={22} />
            </span>
            <div>
              <strong>{payment.id}</strong>
              <small>{payment.order}</small>
            </div>
          </div>
          <div className="payment-management-date-status">
            <span className={`payment-management-status ${statusTone}`}>
              <i />
              {payment.status}
            </span>
            <div>
              <Icon name="calendar" size={18} />
              <span>
                <strong>{paymentDate.date}</strong>
                {paymentDate.time && <small>{paymentDate.time}</small>}
              </span>
            </div>
          </div>
        </div>

        {!detail && !error && (
          <div className="payment-management-state">Loading financial ledger&hellip;</div>
        )}
        {error && (
          <div className="payment-management-error" role="alert">
            {error}
          </div>
        )}

        {detail && (
          <>
            <div className="payment-ledger-summary">
              <div>
                <span>Gross</span>
                <strong>{money(detail.payment.amount)}</strong>
              </div>
              <div>
                <span>Verification</span>
                <strong>{readableValue(detail.payment.verification_status, 'Unverified')}</strong>
              </div>
              <div>
                <span>Settlement</span>
                <strong>{readableValue(detail.payment.settlement_status, 'Pending')}</strong>
              </div>
              <div>
                <span>Dispute</span>
                <strong>{readableValue(detail.case.dispute_status)}</strong>
              </div>
            </div>

            <form className="payment-operation-form" onSubmit={submit}>
              <label>
                Operation
                <select
                  value={action}
                  onChange={(event) => chooseAction(event.target.value as Action)}
                  disabled={saving}
                >
                  {(Object.keys(labels) as Action[]).map((value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Decision
                <select
                  value={decision}
                  onChange={(event) => setDecision(event.target.value)}
                  disabled={saving}
                >
                  {decisions[action].map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {['payout', 'refund'].includes(action) && (
                <label>
                  Amount (PHP)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                    disabled={saving}
                  />
                </label>
              )}
              {['verify', 'settlement', 'payout', 'refund'].includes(action) && (
                <label className={['payout', 'refund'].includes(action) ? '' : 'wide'}>
                  Provider / bank reference
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    maxLength={200}
                    placeholder="Immutable external transaction ID"
                    disabled={saving}
                  />
                </label>
              )}
              {action === 'dispute' && decision === 'resolved' && (
                <label className="wide">
                  Outcome
                  <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                    <option value="customer_favored">Customer favored</option>
                    <option value="farmer_favored">Farmer favored</option>
                    <option value="split">Split resolution</option>
                  </select>
                </label>
              )}
              <label className="wide">
                Evidence and reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  required
                  placeholder="Record what was checked and why this action is authorized"
                  disabled={saving}
                />
              </label>
              <div className="payment-operation-actions wide">
                <button className="primary-button" disabled={saving}>
                  {saving ? 'Saving…' : 'Save audited operation'}
                </button>
              </div>
            </form>

            <section className="payment-audit">
              <h3>Financial history</h3>
              <div className="payment-audit-table" role="table" aria-label="Financial history">
                <div className="payment-audit-head" role="row">
                  <span role="columnheader">Date &amp; Time</span>
                  <span role="columnheader">Operation</span>
                  <span role="columnheader">Decision</span>
                  <span role="columnheader">Performed by</span>
                  <span role="columnheader">Remarks</span>
                </div>
                {detail.history.length === 0 ? (
                  <div className="payment-audit-empty">
                    <span>
                      <Icon name="document" size={22} />
                    </span>
                    <strong>No administrator operations recorded.</strong>
                    <p>Actions made on this payment will appear here.</p>
                  </div>
                ) : (
                  <div className="payment-audit-body">
                    {detail.history.map((entry) => (
                      <div className="payment-audit-row" role="row" key={entry.event_id}>
                        <span role="cell">{new Date(entry.created_at).toLocaleString()}</span>
                        <strong role="cell">{readableValue(entry.event_type)}</strong>
                        <span role="cell">{readableValue(entry.reference, '—')}</span>
                        <span role="cell">{entry.actor}</span>
                        <span role="cell">{entry.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  )
}
