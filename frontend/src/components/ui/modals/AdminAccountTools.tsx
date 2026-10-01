import { useState } from 'react'
import type { FormEvent } from 'react'
import { changeAdminPassword, submitAdminRequest } from '../../../api/adminData'
import { getApiErrorMessage } from '../../../api/adminAuth'
import { CloseButton } from '../closeButton/CloseButton'
import { Icon } from '../icon/Icon'
import './DashboardModals.css'
import './AdminAccountTools.css'

export type AccountTool = 'password' | 'support' | 'feature' | 'help'

type Props = {
  tool: AccountTool | null
  onClose: () => void
  onPasswordChanged: () => void
  onSuccess: (message: string) => void
}

const copy = {
  support: {
    eyebrow: 'SUPPORT',
    title: 'Contact Agrisell support',
    prompt: 'Tell us what is blocking you and include any useful error details.',
  },
  feature: {
    eyebrow: 'PRODUCT FEEDBACK',
    title: 'Suggest a feature',
    prompt: 'Describe the problem to solve and what a useful outcome would look like.',
  },
} as const

export function AdminAccountTools({ tool, onClose, onPasswordChanged, onSuccess }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!tool) return null

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const currentPassword = String(data.get('currentPassword') ?? '')
    const newPassword = String(data.get('newPassword') ?? '')
    const confirm = String(data.get('confirmPassword') ?? '')
    if (newPassword !== confirm) return setError('The new passwords do not match.')
    setBusy(true)
    setError('')
    try {
      await changeAdminPassword(currentPassword, newPassword)
      onPasswordChanged()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'The password could not be changed.'))
    } finally {
      setBusy(false)
    }
  }

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await submitAdminRequest(
        tool === 'feature' ? 'feature' : 'support',
        String(data.get('subject') ?? ''),
        String(data.get('message') ?? ''),
      )
      onClose()
      onSuccess(tool === 'feature' ? 'Feature suggestion submitted.' : 'Support request submitted.')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Your request could not be submitted.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section
        className="modal-card account-tool-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-tool-title"
      >
        <CloseButton label="Close" onClick={onClose} disabled={busy} />
        {tool === 'help' ? (
          <>
            <header className="modal-header">
              <span className="modal-eyebrow">HELP CENTER</span>
              <h2 id="account-tool-title">Administrator help</h2>
              <p className="modal-description">
                Quick guidance for the most common Agrisell administration tasks.
              </p>
            </header>
            <div className="help-topics">
              <article>
                <Icon name="shield" size={21} />
                <div>
                  <strong>Secure your account</strong>
                  <p>
                    Use Security in Settings to review activity, sign out other sessions, and enroll
                    an authenticator app.
                  </p>
                </div>
              </article>
              <article>
                <Icon name="users" size={21} />
                <div>
                  <strong>Manage access</strong>
                  <p>
                    Super administrators can grant only the modules an admin needs and disable
                    access immediately.
                  </p>
                </div>
              </article>
              <article>
                <Icon name="headset" size={21} />
                <div>
                  <strong>Get assistance</strong>
                  <p>
                    Contact Support from this menu. Include the affected record, time, and any error
                    message.
                  </p>
                </div>
              </article>
            </div>
            <div className="modal-actions">
              <button className="primary-button" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : tool === 'password' ? (
          <>
            <header className="modal-header">
              <span className="modal-eyebrow">ACCOUNT SECURITY</span>
              <h2 id="account-tool-title">Change password</h2>
              <p className="modal-description">
                Use at least 12 characters. Other administrator sessions will be signed out.
              </p>
            </header>
            <form className="account-tool-form" onSubmit={submitPassword}>
              <label>
                Current password
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
              {error && (
                <p className="admin-form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button className="primary-button" disabled={busy}>
                  {busy ? 'Changing...' : 'Change password'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <header className="modal-header">
              <span className="modal-eyebrow">{copy[tool].eyebrow}</span>
              <h2 id="account-tool-title">{copy[tool].title}</h2>
              <p className="modal-description">{copy[tool].prompt}</p>
            </header>
            <form className="account-tool-form" onSubmit={submitRequest}>
              <label>
                Subject
                <input name="subject" maxLength={160} required />
              </label>
              <label>
                Message
                <textarea name="message" rows={6} maxLength={5000} required />
              </label>
              {error && (
                <p className="admin-form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button className="primary-button" disabled={busy}>
                  {busy ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
