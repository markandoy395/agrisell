import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  UpdateUserInput,
  VerificationDetail,
  VerificationReviewInput,
} from '../../../api/adminData'
import { getVerificationDetail } from '../../../api/adminData'
import type { EntityRecord, UserWorkspaceRow } from '../../../types/dashboard'
import { CloseButton } from '../closeButton/CloseButton'
import './AccountLifecycleModals.css'

type UserModalProps = {
  user: UserWorkspaceRow | null
  onClose: () => void
  onSave: (input: UpdateUserInput) => Promise<void>
  onStatus: (status: 'active' | 'suspended' | 'deactivated', reason: string) => Promise<void>
}

function UserAccountModalInner({
  user,
  onClose,
  onSave,
  onStatus,
}: UserModalProps & { user: UserWorkspaceRow }) {
  const [draft, setDraft] = useState<UpdateUserInput>(() => ({
    contactNumber: user.contactNumber === 'Not provided' ? '' : user.contactNumber,
    dateOfBirth: user.dateOfBirth === 'Not recorded' ? '' : user.dateOfBirth,
    extensionName: user.extensionName,
    firstName: user.firstName,
    gender: user.gender === 'Not specified' ? '' : user.gender.toLowerCase().replaceAll(' ', '_'),
    lastName: user.lastName,
    middleName: user.middleName,
  }))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await operation()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The account could not be updated.')
    } finally {
      setBusy(false)
    }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    void run(() => onSave(draft))
  }
  const active = user.accountStatus === 'Active'
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card lifecycle-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-account-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close user account" onClick={onClose} />
        <header className="modal-header">
          <span className="modal-eyebrow">ACCOUNT LIFECYCLE</span>
          <h2 id="user-account-title">
            {user.firstName} {user.lastName}
          </h2>
          <p className="modal-description">
            Edit profile details or change access. Suspended and deactivated accounts cannot sign
            in.
          </p>
        </header>
        <form onSubmit={save}>
          <div className="lifecycle-grid">
            <label className="field-label">
              First name
              <input
                value={draft.firstName}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                required
              />
            </label>
            <label className="field-label">
              Last name
              <input
                value={draft.lastName}
                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                required
              />
            </label>
            <label className="field-label">
              Middle name
              <input
                value={draft.middleName ?? ''}
                onChange={(e) => setDraft({ ...draft, middleName: e.target.value })}
              />
            </label>
            <label className="field-label">
              Extension
              <input
                value={draft.extensionName ?? ''}
                onChange={(e) => setDraft({ ...draft, extensionName: e.target.value })}
              />
            </label>
            <label className="field-label">
              Contact number
              <input
                value={draft.contactNumber ?? ''}
                onChange={(e) => setDraft({ ...draft, contactNumber: e.target.value })}
              />
            </label>
            <label className="field-label">
              Date of birth
              <input
                type="date"
                value={draft.dateOfBirth ?? ''}
                onChange={(e) => setDraft({ ...draft, dateOfBirth: e.target.value })}
              />
            </label>
          </div>
          <p className="lifecycle-readonly">
            {user.email} · {user.userType} · Current status: <strong>{user.accountStatus}</strong>
          </p>
          <div className="modal-actions">
            <button className="outline-button" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="primary-button" disabled={busy}>
              Save profile
            </button>
          </div>
        </form>
        <section className="lifecycle-danger">
          <h3>Account access</h3>
          <label className="field-label">
            Reason for restriction
            <input
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                active
                  ? 'Required for suspension or deactivation'
                  : 'Optional note for reactivation'
              }
            />
          </label>
          <div className="lifecycle-status-actions">
            {!active && (
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void run(() => onStatus('active', reason))}
              >
                Reactivate
              </button>
            )}
            {user.accountStatus !== 'Suspended' && (
              <button
                type="button"
                className="outline-button"
                disabled={busy || !reason.trim()}
                onClick={() => void run(() => onStatus('suspended', reason))}
              >
                Suspend
              </button>
            )}
            {user.accountStatus !== 'Deactivated' && (
              <button
                type="button"
                className="danger-button"
                disabled={busy || !reason.trim()}
                onClick={() => void run(() => onStatus('deactivated', reason))}
              >
                Deactivate
              </button>
            )}
          </div>
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}

export function UserAccountModal(props: UserModalProps) {
  return props.user ? (
    <UserAccountModalInner key={props.user.userId} {...props} user={props.user} />
  ) : null
}

type VerificationModalProps = {
  entity: EntityRecord | null
  entityType: 'farmer' | 'rider'
  onClose: () => void
  onReview: (input: VerificationReviewInput) => Promise<void>
}
const missingChoices = [
  'Identity document',
  'Address',
  'Contact details',
  'Profile photo',
  'Farm or vehicle details',
  'Certification or license',
]

function VerificationReviewModalInner({
  entity,
  entityType,
  onClose,
  onReview,
}: VerificationModalProps & { entity: EntityRecord }) {
  const [detail, setDetail] = useState<VerificationDetail | null>(null)
  const [decision, setDecision] = useState<VerificationReviewInput['action']>('profile_updated')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [missing, setMissing] = useState<string[]>([])
  const [profileEdits, setProfileEdits] = useState<Record<string, string>>({})
  const [documentDecisions, setDocumentDecisions] = useState<
    Record<string, { status: 'verified' | 'rejected'; reason: string }>
  >({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!entity.entityId) return
    void getVerificationDetail(entityType, entity.entityId)
      .then(setDetail)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Verification details could not be loaded.'),
      )
  }, [entity.entityId, entityType])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onReview({
        action: decision,
        reason,
        message,
        missingItems: missing,
        profileUpdates: profileEdits,
        documentDecisions: Object.entries(documentDecisions).map(([documentId, value]) => ({
          documentId,
          ...value,
        })),
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The review could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  const profileFields =
    entityType === 'farmer'
      ? [
          ['first_name', 'First name'],
          ['middle_name', 'Middle name'],
          ['last_name', 'Last name'],
          ['phone_number', 'Contact number'],
          ['address_line', 'Address'],
          ['barangay', 'Barangay'],
          ['city_municipality', 'City / municipality'],
          ['province', 'Province'],
          ['postal_code', 'Postal code'],
          ['certification', 'Certification'],
        ]
      : [
          ['first_name', 'First name'],
          ['middle_name', 'Middle name'],
          ['last_name', 'Last name'],
          ['contact_number', 'Contact number'],
          ['complete_address', 'Address'],
          ['license_number', 'License number'],
          ['vehicle_type', 'Vehicle type'],
          ['vehicle_plate_number', 'Plate number'],
        ]
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card lifecycle-modal verification-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CloseButton label="Close verification review" onClick={onClose} />
        <header className="modal-header">
          <span className="modal-eyebrow">VERIFICATION REVIEW</span>
          <h2 id="verification-title">{entity.primary}</h2>
          <p className="modal-description">
            Review submitted information and record a decision with an audit trail.
          </p>
        </header>
        {!detail && !error ? (
          <p>Loading verification materials…</p>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            {detail && (
              <section>
                <h3>Profile information</h3>
                <div className="lifecycle-grid">
                  {profileFields.map(([field, label]) => (
                    <label className="field-label" key={field}>
                      {label}
                      <input
                        value={
                          profileEdits[field] ??
                          (typeof detail.profile[field] === 'string'
                            ? (detail.profile[field] as string)
                            : '')
                        }
                        onChange={(e) =>
                          setProfileEdits({ ...profileEdits, [field]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            )}
            {detail?.documents.length ? (
              <section>
                <h3>Submitted documents</h3>
                <div className="document-list">
                  {detail.documents.map((doc) => (
                    <article key={doc.document_id}>
                      <div>
                        <strong>{doc.document_type.replaceAll('_', ' ')}</strong>
                        <small>
                          {doc.document_number || 'No document number'} · {doc.verification_status}
                        </small>
                        {doc.signed_url && (
                          <a href={doc.signed_url} target="_blank" rel="noreferrer">
                            Open document
                          </a>
                        )}
                      </div>
                      <select
                        value={
                          documentDecisions[doc.document_id]?.status ?? doc.verification_status
                        }
                        onChange={(e) =>
                          setDocumentDecisions({
                            ...documentDecisions,
                            [doc.document_id]: {
                              status: e.target.value as 'verified' | 'rejected',
                              reason: documentDecisions[doc.document_id]?.reason ?? '',
                            },
                          })
                        }
                      >
                        <option value="pending" disabled>
                          Pending
                        </option>
                        <option value="verified">Accept</option>
                        <option value="rejected">Reject</option>
                      </select>
                      {documentDecisions[doc.document_id]?.status === 'rejected' && (
                        <input
                          required
                          placeholder="Document rejection reason"
                          value={documentDecisions[doc.document_id]?.reason ?? ''}
                          onChange={(e) =>
                            setDocumentDecisions({
                              ...documentDecisions,
                              [doc.document_id]: { status: 'rejected', reason: e.target.value },
                            })
                          }
                        />
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <p className="lifecycle-readonly">
                No uploaded documents are attached. Review the profile and registered{' '}
                {entityType === 'farmer' ? 'farm images/certifications' : 'rider details'} before
                deciding.
              </p>
            )}
            <label className="field-label">
              Decision
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value as VerificationReviewInput['action'])}
              >
                <option value="profile_updated">Save profile changes only</option>
                <option value="verified">Approve</option>
                <option value="rejected">Reject application</option>
                <option value="needs_information">Request missing information</option>
                <option value="suspended">Suspend account</option>
                <option value="deactivated">Deactivate account</option>
                <option value="reactivated">Reactivate account</option>
              </select>
            </label>
            {['rejected', 'suspended', 'deactivated'].includes(decision) && (
              <label className="field-label">
                Reason
                <textarea
                  required
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {decision === 'needs_information' && (
              <>
                <fieldset className="missing-items">
                  <legend>Missing or outdated items</legend>
                  {missingChoices.map((choice) => (
                    <label key={choice}>
                      <input
                        type="checkbox"
                        checked={missing.includes(choice)}
                        onChange={() =>
                          setMissing(
                            missing.includes(choice)
                              ? missing.filter((item) => item !== choice)
                              : [...missing, choice],
                          )
                        }
                      />
                      {choice}
                    </label>
                  ))}
                </fieldset>
                <label className="field-label">
                  Message to applicant
                  <textarea
                    required
                    maxLength={1000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </label>
              </>
            )}
            {detail?.actions.length ? (
              <details>
                <summary>Review history ({detail.actions.length})</summary>
                {detail.actions.map((action) => (
                  <p key={action.action_id}>
                    <strong>{action.action.replaceAll('_', ' ')}</strong> · {action.actor_email}
                    <br />
                    {action.reason || action.message || 'No note'}
                  </p>
                ))}
              </details>
            ) : null}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="outline-button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" disabled={busy || !detail}>
                {busy ? 'Saving…' : 'Save decision'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

export function VerificationReviewModal(props: VerificationModalProps) {
  return props.entity ? (
    <VerificationReviewModalInner
      key={`${props.entityType}-${props.entity.entityId}`}
      {...props}
      entity={props.entity}
    />
  ) : null
}
