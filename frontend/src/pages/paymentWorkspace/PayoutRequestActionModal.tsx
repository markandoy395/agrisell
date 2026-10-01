import { useState } from 'react'
import type { AdminPayoutRequest } from '../../api/adminPayoutRequestsApi'
import { Icon } from '../../components/ui/icon/Icon'
import './PayoutRequestActionModal.css'

type ModalMode = 'reject' | 'mark_paid' | 'details'

type PayoutRequestActionModalProps = {
  request: AdminPayoutRequest
  mode: ModalMode
  onClose: () => void
  onSubmitAction: (
    action: 'approve' | 'reject' | 'mark_paid',
    data: { notes?: string; rejection_reason?: string },
  ) => Promise<void>
}

export function PayoutRequestActionModal({
  request,
  mode,
  onClose,
  onSubmitAction,
}: PayoutRequestActionModalProps) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    if (mode === 'reject' && !reason.trim()) {
      setError('Please provide a reason for rejection.')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'reject') {
        await onSubmitAction('reject', { rejection_reason: reason.trim() })
      } else if (mode === 'mark_paid') {
        await onSubmitAction('mark_paid', { notes: notes.trim() })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="payout-modal-overlay" role="dialog" aria-modal="true">
      <div className="payout-modal-card">
        <header className="payout-modal-header">
          <div className="payout-modal-title-group">
            <span
              className={`payout-modal-icon ${
                mode === 'reject' ? 'is-danger' : mode === 'mark_paid' ? 'is-success' : 'is-info'
              }`}
            >
              <Icon name={mode === 'reject' ? 'close' : mode === 'mark_paid' ? 'check' : 'card'} size={18} />
            </span>
            <div>
              <h3>
                {mode === 'reject'
                  ? 'Reject Payout Request'
                  : mode === 'mark_paid'
                    ? 'Disburse Payout / Mark as Paid'
                    : 'Payout Request Details'}
              </h3>
              <small>ID: {request.request_id.slice(0, 8)}... · {request.requester_name} ({request.user_role})</small>
            </div>
          </div>
          <button type="button" className="payout-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="payout-modal-body">
          {error && <div className="payout-modal-alert is-error">{error}</div>}

          <div className="payout-summary-box">
            <div className="payout-summary-row">
              <span>Amount:</span>
              <strong>₱{request.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div className="payout-summary-row">
              <span>Method:</span>
              <strong>{request.payout_method === 'bank_transfer' ? `Bank (${request.bank_name || 'Bank'})` : 'GCash'}</strong>
            </div>
            <div className="payout-summary-row">
              <span>Account Name:</span>
              <strong>{request.account_name}</strong>
            </div>
            <div className="payout-summary-row">
              <span>Account Number:</span>
              <strong>{request.account_number}</strong>
            </div>
            <div className="payout-summary-row">
              <span>Current Status:</span>
              <span className={`payout-status-chip is-${request.status}`}>{request.status.toUpperCase()}</span>
            </div>
            {request.requester_phone && (
              <div className="payout-summary-row">
                <span>Phone:</span>
                <strong>{request.requester_phone}</strong>
              </div>
            )}
            {request.requester_email && (
              <div className="payout-summary-row">
                <span>Email:</span>
                <strong>{request.requester_email}</strong>
              </div>
            )}
            {request.rejection_reason && (
              <div className="payout-summary-row">
                <span>Rejection Reason:</span>
                <span className="payout-text-danger">{request.rejection_reason}</span>
              </div>
            )}
            {request.notes && (
              <div className="payout-summary-row">
                <span>Notes / Ref:</span>
                <strong>{request.notes}</strong>
              </div>
            )}
          </div>

          {mode === 'reject' && (
            <div className="payout-form-group">
              <label htmlFor="payout-rejection-reason">Rejection Reason *</label>
              <textarea
                id="payout-rejection-reason"
                rows={3}
                placeholder="Explain why this cash-out request is being rejected (e.g. incorrect account number, suspicious activity, etc.)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          {mode === 'mark_paid' && (
            <div className="payout-form-group">
              <label htmlFor="payout-disbursement-notes">Disbursement Reference / Notes (Optional)</label>
              <input
                id="payout-disbursement-notes"
                type="text"
                placeholder="e.g. GCash Reference No. 1234567890 or Bank Trans ID"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <small className="payout-form-hint">
                Marking as paid notifies the {request.user_role} that their funds have been successfully transferred.
              </small>
            </div>
          )}
        </div>

        <footer className="payout-modal-footer">
          <button type="button" className="payout-button-secondary" onClick={onClose} disabled={isSubmitting}>
            {mode === 'details' ? 'Close' : 'Cancel'}
          </button>
          {mode !== 'details' && (
            <button
              type="button"
              className={`payout-button-primary ${mode === 'reject' ? 'is-danger' : 'is-success'}`}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Processing...'
                : mode === 'reject'
                  ? 'Reject Request'
                  : 'Confirm Disbursement'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
