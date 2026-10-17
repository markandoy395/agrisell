import { useEffect, useState, type FormEvent } from 'react'
import { getVerificationDetail, reviewVerification } from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import { Icon } from '../../components/ui/icon/Icon'
import type { EntityRecord } from '../../types/dashboard'
import { getRiderInitials } from './logisticsWorkspace.utils'
import './EditRiderModal.css'

type Field =
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'contact_number'
  | 'complete_address'
  | 'license_number'
  | 'vehicle_type'
  | 'vehicle_plate_number'

type Draft = Record<Field, string>

const fields: Field[] = [
  'first_name',
  'middle_name',
  'last_name',
  'contact_number',
  'complete_address',
  'license_number',
  'vehicle_type',
  'vehicle_plate_number',
]

const fieldValue = (input: unknown) => (typeof input === 'string' ? input : '')

const formatDate = (input: unknown) => {
  if (typeof input !== 'string' || !input) return 'Not recorded'
  const parsed = new Date(input)
  return Number.isNaN(parsed.getTime())
    ? 'Not recorded'
    : parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
}

export function EditRiderModal({
  rider,
  onClose,
  onSaved,
}: {
  rider: EntityRecord
  onClose: () => void
  onSaved?: () => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState<Draft | null>(null)
  const [email, setEmail] = useState('')
  const [joined, setJoined] = useState('Not recorded')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!rider.entityId) {
      setError('This rider has no saved profile to edit.')
      return
    }
    let active = true
    getVerificationDetail('rider', rider.entityId)
      .then(({ profile }) => {
        if (!active) return
        const loaded = Object.fromEntries(
          fields.map((field) => [field, fieldValue(profile[field])]),
        ) as Draft
        setDraft(loaded)
        setOriginal(loaded)
        setEmail(fieldValue(profile.email))
        setJoined(formatDate(profile.created_at))
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

  const setField = (field: Field, value: string) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current))
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft || !original || !rider.entityId || saving) return
    if (
      ['first_name', 'last_name', 'contact_number', 'complete_address', 'vehicle_type'].some(
        (field) => !draft[field as Field].trim(),
      )
    ) {
      setError('Complete all required rider fields before saving.')
      return
    }
    const changed = Object.fromEntries(
      fields
        .filter((field) => draft[field].trim() !== original[field].trim())
        .map((field) => [field, draft[field].trim()]),
    ) as Partial<Draft>
    if (Object.keys(changed).length === 0) {
      onClose()
      return
    }
    if ('first_name' in changed || 'middle_name' in changed || 'last_name' in changed) {
      changed.first_name = draft.first_name.trim()
      changed.middle_name = draft.middle_name.trim()
      changed.last_name = draft.last_name.trim()
    }
    const phone = draft.contact_number.replace(/[\s()-]/g, '')
    if (!/^(09\d{9}|\+639\d{9})$/.test(phone)) {
      setError('Enter a valid Philippine mobile number (09… or +639…).')
      return
    }
    if ('contact_number' in changed) changed.contact_number = phone
    setError('')
    setSaving(true)
    try {
      await reviewVerification('rider', rider.entityId, {
        action: 'profile_updated',
        profileUpdates: changed,
      })
      await onSaved?.()
      onClose()
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'The rider profile could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop rider-edit-backdrop"
      onMouseDown={() => {
        if (!saving) onClose()
      }}
    >
      <section
        className="rider-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rider-edit-header">
          <div>
            <h2 id="rider-edit-title">Edit Rider</h2>
            <p>Update this rider’s registered profile and vehicle details.</p>
          </div>
          <button type="button" aria-label="Close edit rider" onClick={onClose} disabled={saving}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="rider-edit-summary">
          <span className="rider-edit-avatar">{getRiderInitials(rider.primary)}</span>
          <div>
            <strong>{rider.primary}</strong>
            <span>{rider.approvalStatus ?? 'Pending approval'} Rider</span>
            <small>
              <Icon name="mail" size={15} />
              {email || rider.secondary}
            </small>
          </div>
        </div>
        {error && (
          <p className="rider-edit-error" role="alert">
            {error}
          </p>
        )}
        {!draft ? (
          <p className="rider-edit-loading">
            {error ? 'Editing is unavailable until the profile loads.' : 'Loading rider profile…'}
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              void save(event)
            }}
          >
            <div className="rider-edit-grid">
              <section className="rider-edit-card">
                <h3>Personal Information</h3>
                <label>
                  First Name <b>*</b>
                  <input
                    autoFocus
                    required
                    maxLength={100}
                    value={draft.first_name}
                    onChange={(event) => setField('first_name', event.target.value)}
                  />
                </label>
                <label>
                  Middle Name
                  <input
                    maxLength={100}
                    value={draft.middle_name}
                    onChange={(event) => setField('middle_name', event.target.value)}
                  />
                </label>
                <label>
                  Last Name <b>*</b>
                  <input
                    required
                    maxLength={100}
                    value={draft.last_name}
                    onChange={(event) => setField('last_name', event.target.value)}
                  />
                </label>
                <label>
                  Email Address
                  <input value={email || 'Not recorded'} readOnly />
                </label>
                <label>
                  Phone Number <b>*</b>
                  <input
                    required
                    type="tel"
                    value={draft.contact_number}
                    onChange={(event) => setField('contact_number', event.target.value)}
                  />
                </label>
                <label>
                  Complete Address <b>*</b>
                  <input
                    required
                    value={draft.complete_address}
                    onChange={(event) => setField('complete_address', event.target.value)}
                  />
                </label>
              </section>
              <section className="rider-edit-card">
                <h3>Vehicle Information</h3>
                <label>
                  Vehicle Type <b>*</b>
                  <input
                    required
                    value={draft.vehicle_type}
                    onChange={(event) => setField('vehicle_type', event.target.value)}
                  />
                </label>
                <label>
                  Plate Number
                  <input
                    value={draft.vehicle_plate_number}
                    onChange={(event) => setField('vehicle_plate_number', event.target.value)}
                    placeholder="Optional for vehicles without a plate"
                  />
                </label>
                <label>
                  License Number
                  <input
                    value={draft.license_number}
                    onChange={(event) => setField('license_number', event.target.value)}
                  />
                </label>
                <div className="rider-edit-readonly">
                  <h3>Account Information</h3>
                  <span>
                    Affiliation / Company<strong>{rider.category}</strong>
                  </span>
                  <span>
                    Date Joined<strong>{joined}</strong>
                  </span>
                  <span>
                    Approval Status<strong>{rider.approvalStatus ?? 'Pending approval'}</strong>
                  </span>
                  <span>
                    Availability<strong>{rider.status}</strong>
                  </span>
                </div>
              </section>
            </div>
            <footer className="rider-edit-footer">
              <button type="button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                <Icon name="save" size={17} />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  )
}
