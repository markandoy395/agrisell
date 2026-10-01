import { useState, type ChangeEvent, type FormEventHandler } from 'react'
import type { AdminProfile } from '../../../types/dashboard'
import { CloseButton } from '../closeButton/CloseButton'
import { Icon } from '../icon/Icon'
import { PROFILE_PERMISSION_DETAILS } from './profilePermissions'
import { resizeProfilePhoto } from './profilePhoto'

type ProfileModalProps = {
  permissions: string[]
  profile: AdminProfile
  onClose: () => void
  onSave: (profile: AdminProfile) => Promise<void>
}

export function ProfileModal({ permissions, profile, onClose, onSave }: ProfileModalProps) {
  const [draft, setDraft] = useState(profile)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const hasFullAccess = permissions.includes('admin:manage')
  const updatePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const photo = event.target.files?.[0]
    if (!photo) return
    setError('')
    try {
      const avatarUrl = await resizeProfilePhoto(photo)
      setDraft((current) => ({ ...current, avatarUrl }))
    } catch (photoError) {
      setError(
        photoError instanceof Error
          ? photoError.message
          : 'The profile image could not be prepared.',
      )
    } finally {
      event.target.value = ''
    }
  }
  const saveProfile: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    const name = draft.name.trim()
    const email = draft.email.trim()
    const role = draft.role.trim()
    if (!name || !email || !role) return
    setError('')
    setIsSaving(true)
    void onSave({ ...draft, name, email, role })
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : 'The profile could not be saved.')
      })
      .finally(() => setIsSaving(false))
  }
  return (
    <div className="modal-backdrop profile-modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close profile modal" onClick={onClose} />
        <header className="profile-modal-header">
          <span className="profile-header-icon">
            <Icon name="profile" size={23} />
          </span>
          <div>
            <span className="profile-modal-eyebrow">ADMIN PROFILE</span>
            <h2 id="profile-title">Profile Information</h2>
            <p>View and manage your account details and privileges.</p>
          </div>
        </header>
        <section className="profile-hero" aria-label="Profile summary">
          <label
            className={`profile-hero-avatar${draft.avatarUrl ? ' has-photo' : ''}`}
            title="Change profile photo"
          >
            {draft.avatarUrl ? <img src={draft.avatarUrl} alt="" /> : draft.initials}
            <span className="profile-camera">
              <Icon name="camera" size={18} />
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                void updatePhoto(event)
              }}
              disabled={isSaving}
            />
          </label>
          <div className="profile-hero-main">
            <strong>{draft.name || 'Administrator'}</strong>
            <span>{draft.email || 'Add an email address'}</span>
            <div className="profile-statuses">
              <span>
                <Icon name="shield" size={16} />
                {hasFullAccess ? 'Super Administrator' : 'Administrator'}
              </span>
              <span>
                <i />
                Active
              </span>
            </div>
          </div>
          <blockquote>
            “Manage today
            <br />
            for a better tomorrow.”
            <Icon name="leaf" size={21} />
          </blockquote>
        </section>
        <section className="profile-details-card">
          <div className="profile-section-heading">
            <span className="profile-section-icon">
              <Icon name="grid" size={22} />
            </span>
            <div>
              <strong id="profile-access-title">Account Privileges</strong>
              <span>Modules and features you can access.</span>
            </div>
            <span className="profile-full-access">
              <Icon name="crown" size={19} />
              {hasFullAccess ? 'FULL ACCESS' : `${permissions.length} PRIVILEGES`}
            </span>
          </div>
          <div className="profile-access-list" role="list">
            {permissions.map((permission) => {
              const detail = PROFILE_PERMISSION_DETAILS[permission]
              return detail ? (
                <div className="profile-privilege" key={permission} role="listitem">
                  <Icon name={detail.icon} size={27} />
                  <span>
                    <strong>{detail.label}</strong>
                    <small>{detail.description}</small>
                  </span>
                </div>
              ) : null
            })}
          </div>
          <form
            id="profile-information-form"
            className="profile-information-form"
            onSubmit={saveProfile}
          >
            <div className="profile-section-heading profile-personal-heading">
              <span className="profile-section-icon">
                <Icon name="profile" size={22} />
              </span>
              <div>
                <strong>Personal Information</strong>
                <span>Update your account details below.</span>
              </div>
            </div>
            <div className="profile-fields">
              <label className="field-label">
                Full name
                <span className="profile-input">
                  <Icon name="profile" size={20} />
                  <input
                    autoFocus
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </span>
              </label>
              <label className="field-label">
                Email address
                <span className="profile-input">
                  <Icon name="mail" size={20} />
                  <input type="email" value={draft.email} readOnly required />
                </span>
              </label>
              <label className="field-label">
                Role
                <span className="profile-input">
                  <Icon name="shield" size={20} />
                  <input value={draft.role} readOnly required />
                  <Icon name="chevron" size={17} />
                </span>
              </label>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>
        <div className="modal-actions profile-modal-actions">
          <button type="button" className="outline-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            form="profile-information-form"
            disabled={isSaving}
          >
            <Icon name="save" size={18} />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </section>
    </div>
  )
}
