import { useEffect, useState } from 'react'
import {
  beginMfaEnrollment,
  getSecurityOverview,
  revokeOtherAdminSessions,
  removeMfaFactor,
  verifyMfaEnrollment,
} from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { SecurityOverview } from '../../api/adminSecurity'
import { Icon } from '../../components/ui/icon/Icon'

type Enrollment = { factorId: string; qrCode: string; secret: string }

const eventLabel = (action: string) =>
  action.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
const formatTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString()
}

export function SecurityCenter() {
  const [overview, setOverview] = useState<SecurityOverview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')

  const load = () =>
    getSecurityOverview()
      .then(setOverview)
      .catch((requestError) => {
        setError(getApiErrorMessage(requestError, 'Security information could not be loaded.'))
      })

  useEffect(() => {
    void load()
  }, [])

  const revokeOthers = async () => {
    setBusy(true)
    setError('')
    try {
      await revokeOtherAdminSessions()
      await load()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Other sessions could not be signed out.'))
    } finally {
      setBusy(false)
    }
  }

  const enroll = async () => {
    setBusy(true)
    setError('')
    try {
      setEnrollment(await beginMfaEnrollment())
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'MFA enrollment could not be started.'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!enrollment || !/^\d{6}$/.test(code))
      return setError('Enter the 6-digit code from your authenticator app.')
    setBusy(true)
    setError('')
    try {
      await verifyMfaEnrollment(enrollment.factorId, code)
      setEnrollment(null)
      setCode('')
      await load()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'The authentication code could not be verified.'))
    } finally {
      setBusy(false)
    }
  }

  const disableMfa = async () => {
    if (
      !overview?.mfaFactorId ||
      !window.confirm('Disable authenticator-based MFA for this administrator account?')
    )
      return
    setBusy(true)
    setError('')
    try {
      await removeMfaFactor(overview.mfaFactorId)
      await load()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'MFA could not be disabled.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-workspace security-center panel">
      <div className="settings-panel-heading">
        <span className="settings-heading-icon">
          <Icon name="shield" size={24} />
        </span>
        <div>
          <h2>Account security</h2>
          <p>Review administrator activity, sessions, and multi-factor authentication.</p>
        </div>
      </div>
      {error && (
        <p className="settings-preference-error" role="alert">
          {error}
        </p>
      )}
      {!overview ? (
        <p className="security-loading">Loading security information...</p>
      ) : (
        <div className="security-grid">
          <article className="security-card">
            <div className="security-card-heading">
              <div>
                <strong>Active sessions</strong>
                <span>
                  {overview.sessions.length} recognized session
                  {overview.sessions.length === 1 ? '' : 's'}
                </span>
              </div>
              <Icon name="lock" size={20} />
            </div>
            <div className="security-session-list">
              {overview.sessions.map((session) => (
                <div key={session.id}>
                  <span className="security-status-dot" />
                  <div>
                    <strong>{session.current ? 'This session' : 'Administrator session'}</strong>
                    <small>
                      Started {formatTime(session.issuedAt)} · Expires{' '}
                      {formatTime(session.expiresAt)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="outline-button"
              type="button"
              disabled={busy}
              onClick={() => void revokeOthers()}
            >
              Sign out other sessions
            </button>
          </article>
          <article className="security-card">
            <div className="security-card-heading">
              <div>
                <strong>Authenticator app</strong>
                <span>
                  {overview.mfaEnabled
                    ? 'MFA is enabled'
                    : overview.mfaAvailable
                      ? 'Add a second sign-in factor'
                      : 'Requires Supabase authentication'}
                </span>
              </div>
              <Icon name="shield" size={20} />
            </div>
            {enrollment ? (
              <div className="mfa-enrollment">
                {enrollment.qrCode && (
                  <img src={enrollment.qrCode} alt="Authenticator enrollment QR code" />
                )}
                <p>
                  Scan the QR code, or enter <code>{enrollment.secret}</code>, then provide the
                  current code.
                </p>
                <div>
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    aria-label="Six-digit authentication code"
                    placeholder="000000"
                  />
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void verify()}
                  >
                    Verify
                  </button>
                </div>
              </div>
            ) : overview.mfaEnabled ? (
              <button
                className="outline-button"
                type="button"
                disabled={busy}
                onClick={() => void disableMfa()}
              >
                Disable authenticator
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                disabled={busy || !overview.mfaAvailable}
                onClick={() => void enroll()}
              >
                Set up authenticator
              </button>
            )}
          </article>
          <article className="security-card security-activity">
            <div className="security-card-heading">
              <div>
                <strong>Administrator activity log</strong>
                <span>Recent security and access changes</span>
              </div>
              <Icon name="document" size={20} />
            </div>
            <div className="security-event-list">
              {overview.events.slice(0, 12).map((event) => (
                <div key={event.id || `${event.createdAt}-${event.action}`}>
                  <span>
                    <strong>{eventLabel(event.action)}</strong>
                    <small>
                      {event.actorEmail} · {formatTime(event.createdAt)}
                    </small>
                  </span>
                  <p>{event.detail}</p>
                </div>
              ))}
              {!overview.events.length && (
                <p className="security-empty">No security activity has been recorded yet.</p>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
