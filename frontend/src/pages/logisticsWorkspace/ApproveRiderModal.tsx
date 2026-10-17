import { useEffect, useState, type FormEvent } from 'react'
import { getVerificationDetail, type VerificationDetail } from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import { Icon } from '../../components/ui/icon/Icon'
import type { EntityRecord } from '../../types/dashboard'
import type { IconName } from '../../types/icon'
import { getRiderInitials } from './logisticsWorkspace.utils'
import './ApproveRiderModal.css'

const initialMessage =
  'Congratulations! Your account has been approved. You can now go online and receive delivery requests.'
const textValue = (input: unknown, fallback = 'Not recorded') =>
  typeof input === 'string' && input.trim() ? input : fallback
const dateValue = (input: unknown) => {
  if (typeof input !== 'string' || !input) return 'Not recorded'
  const date = new Date(input)
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
}

function DetailItem({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="rider-approve-detail">
      <Icon name={icon} size={17} />
      <span>
        <strong>{label}</strong>
        <small>{value}</small>
      </span>
    </div>
  )
}

export function ApproveRiderModal({
  rider,
  onClose,
  onApprove,
}: {
  rider: EntityRecord
  onClose: () => void
  onApprove: (message: string) => Promise<void>
}) {
  const [detail, setDetail] = useState<VerificationDetail | null>(null)
  const [message, setMessage] = useState(initialMessage)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!rider.entityId) {
      setError('This rider has no saved profile to approve.')
      return
    }
    let active = true
    getVerificationDetail('rider', rider.entityId)
      .then((loaded) => {
        if (active) setDetail(loaded)
      })
      .catch((caught) => {
        if (active)
          setError(getApiErrorMessage(caught, 'The rider information could not be loaded.'))
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
    if (!detail || saving) return
    setError('')
    setSaving(true)
    try {
      await onApprove(message.trim())
      onClose()
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'The rider could not be approved.'))
    } finally {
      setSaving(false)
    }
  }

  const profile = detail?.profile ?? {}
  const email = textValue(
    profile.email,
    rider.secondary.includes('@') ? rider.secondary : 'Not recorded',
  )
  const phone = textValue(
    profile.contact_number,
    rider.secondary.includes('@') ? 'Not recorded' : rider.secondary,
  )
  const fullName = textValue(profile.full_name, rider.primary)
  const documents = detail?.documents ?? []

  return (
    <div
      className="modal-backdrop rider-approve-backdrop"
      onMouseDown={() => {
        if (!saving) onClose()
      }}
    >
      <section
        className="rider-approve-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-approve-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rider-approve-header">
          <div>
            <h2 id="rider-approve-title">Approve Rider</h2>
            <p>Review the rider’s information before approving the account.</p>
          </div>
          <button type="button" aria-label="Close approval" onClick={onClose} disabled={saving}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="rider-approve-summary">
          <span className="rider-approve-avatar">{getRiderInitials(fullName)}</span>
          <div>
            <strong>{fullName}</strong>
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
        {error && (
          <p className="rider-approve-error" role="alert">
            {error}
          </p>
        )}
        {!detail ? (
          <p className="rider-approve-loading">
            {error
              ? 'Approval is unavailable until the rider information loads.'
              : 'Loading rider information…'}
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              void submit(event)
            }}
          >
            <div className="rider-approve-grid">
              <section className="rider-approve-card">
                <h3>
                  <Icon name="profile" size={18} />
                  Personal Information
                </h3>
                <DetailItem icon="profile" label="Full Name" value={fullName} />
                <DetailItem icon="mail" label="Email Address" value={email} />
                <DetailItem icon="phone" label="Phone Number" value={phone} />
                <DetailItem
                  icon="calendar"
                  label="Date Joined"
                  value={dateValue(profile.created_at)}
                />
                <DetailItem icon="home" label="Affiliation / Company" value={rider.category} />
              </section>
              <section className="rider-approve-card">
                <h3>
                  <Icon name="truck" size={18} />
                  Vehicle & Documents
                </h3>
                <DetailItem
                  icon="truck"
                  label="Vehicle Type"
                  value={textValue(profile.vehicle_type, rider.value.split(' · ')[0])}
                />
                <DetailItem
                  icon="card"
                  label="Plate Number"
                  value={textValue(profile.vehicle_plate_number, 'N/A')}
                />
                <h4>Submitted Documents</h4>
                {documents.length ? (
                  documents.map((document) => (
                    <div className="rider-approve-document" key={document.document_id}>
                      {document.signed_url ? (
                        <a
                          className="rider-approve-document-preview"
                          href={document.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${document.document_type.replaceAll('_', ' ')}`}
                        >
                          <img
                            src={document.signed_url}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = 'none'
                            }}
                          />
                          <Icon name="document" size={20} />
                        </a>
                      ) : (
                        <span className="rider-approve-document-preview">
                          <Icon name="document" size={20} />
                        </span>
                      )}
                      <span>
                        <strong>{document.document_type.replaceAll('_', ' ')}</strong>
                        <small>{document.verification_status}</small>
                      </span>
                      {document.signed_url && (
                        <a href={document.signed_url} target="_blank" rel="noreferrer">
                          View
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <p>No documents recorded.</p>
                )}
              </section>
            </div>
            <label className="rider-approve-message">
              Optional message to rider
              <textarea
                maxLength={200}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
              />
            </label>
            <span className="rider-approve-count">{message.length}/200</span>
            <div className="rider-approve-note">
              <Icon name="info" size={19} />
              <div>
                <strong>What happens next?</strong>
                <p>
                  The rider’s verification and employment status will become approved and active.
                  They can then choose to go online in the rider app. If they have a linked account,
                  they will receive a notification.
                </p>
              </div>
            </div>
            <footer className="rider-approve-footer">
              <button type="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                <Icon name="check" size={17} />
                {saving ? 'Approving…' : 'Approve Rider'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  )
}
