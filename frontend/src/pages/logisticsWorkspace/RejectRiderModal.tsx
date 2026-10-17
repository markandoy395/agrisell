import { useEffect, useState, type FormEvent } from 'react'
import { getVerificationDetail } from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import { Icon } from '../../components/ui/icon/Icon'
import type { EntityRecord } from '../../types/dashboard'
import { getRiderInitials } from './logisticsWorkspace.utils'
import './RejectRiderModal.css'

const reasons = [
  'Incomplete requirements',
  'Invalid ID / Documents',
  'Did not meet qualifications',
  'Vehicle information is invalid',
  'Background check failed',
  'Other',
]

export function RejectRiderModal({
  rider,
  onClose,
  onReject,
}: {
  rider: EntityRecord
  onClose: () => void
  onReject: (reason: string) => Promise<void>
}) {
  const [email, setEmail] = useState(
    rider.secondary.includes('@') ? rider.secondary : 'Not recorded',
  )
  const [phone, setPhone] = useState(
    rider.secondary.includes('@') ? 'Not recorded' : rider.secondary,
  )
  const [loaded, setLoaded] = useState(false)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!rider.entityId) {
      setError('This rider has no saved profile to reject.')
      return
    }
    let active = true
    getVerificationDetail('rider', rider.entityId)
      .then(({ profile }) => {
        if (!active) return
        if (typeof profile.email === 'string' && profile.email) setEmail(profile.email)
        if (typeof profile.contact_number === 'string' && profile.contact_number)
          setPhone(profile.contact_number)
        setLoaded(true)
      })
      .catch((caught) => {
        if (active) setError(getApiErrorMessage(caught, 'The rider profile could not be loaded.'))
      })
    return () => {
      active = false
    }
  }, [rider.entityId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!loaded || saving) return
    const detail = notes.trim()
    if (!reason || (reason === 'Other' && !detail)) {
      setError('Select a reason and provide details when choosing Other.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onReject(detail ? `${reason}: ${detail}` : reason)
      onClose()
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'The rider could not be rejected.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop rider-reject-backdrop"
      onMouseDown={() => {
        if (!saving) onClose()
      }}
    >
      <section
        className="rider-reject-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-reject-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rider-reject-header">
          <div>
            <h2 id="rider-reject-title">Reject Rider</h2>
            <p>Are you sure you want to reject this rider’s application?</p>
          </div>
          <button type="button" aria-label="Close rejection" onClick={onClose} disabled={saving}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="rider-reject-summary">
          <span className="rider-reject-avatar">{getRiderInitials(rider.primary)}</span>
          <div>
            <strong>{rider.primary}</strong>
            <span>{rider.approvalStatus ?? 'Pending approval'}</span>
            <small>
              <Icon name="mail" size={15} />
              {email}
            </small>
            <small>
              <Icon name="phone" size={15} />
              {phone}
            </small>
          </div>
        </div>
        <div className="rider-reject-warning">
          <Icon name="alert" size={22} />
          <div>
            <strong>Reject Rider Application</strong>
            <p>
              The rider will be marked rejected and offline, and will not be eligible for
              deliveries.
            </p>
          </div>
        </div>
        {error && (
          <p className="rider-reject-error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          <label className="rider-reject-field">
            Reason for Rejection <b>*</b>
            <select
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={!loaded || saving}
            >
              <option value="">Select a reason…</option>
              {reasons.map((option) => (
                <option key={option} value={option}>
                  {option === 'Other' ? 'Other (please specify)' : option}
                </option>
              ))}
            </select>
          </label>
          <label className="rider-reject-field">
            Additional Notes {reason === 'Other' ? <b>*</b> : '(Optional)'}
            <textarea
              required={reason === 'Other'}
              maxLength={200}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add more details about the reason for rejection…"
              rows={3}
              disabled={!loaded || saving}
            />
          </label>
          <span className="rider-reject-count">{notes.length}/200</span>
          <footer className="rider-reject-footer">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={!loaded || saving}>
              <Icon name="trash" size={16} />
              {saving ? 'Rejecting…' : 'Reject Rider'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
