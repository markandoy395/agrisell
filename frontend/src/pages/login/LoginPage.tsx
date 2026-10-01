import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiRequestError, getApiErrorMessage } from '../../api/adminAuth'
import type { LoginCredentials } from '../../api/adminAuth'
import { Icon } from '../../components/ui/icon/Icon'
import agrisellLogo from '../../assets/image/logo/Agrisell - Landscape Logo.png'
import './LoginPage.css'

type LoginPageProps = {
  onLogin: (credentials: LoginCredentials) => Promise<void>
  onMfa: (code: string) => Promise<void>
}

export function LoginPage({ onLogin, onMfa }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedEmail = email.trim()

    if (mfaRequired && !/^\d{6}$/.test(mfaCode)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }

    if (!trimmedEmail || !password) {
      setError('Enter your admin email and password.')
      return
    }

    if (!trimmedEmail.includes('@')) {
      setError('Enter a valid admin email address.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      if (mfaRequired) await onMfa(mfaCode)
      else await onLogin({ email: trimmedEmail, password })
    } catch (loginError) {
      if (loginError instanceof ApiRequestError && loginError.code === 'MFA_REQUIRED') {
        setMfaRequired(true)
        setError('')
        return
      }
      setError(getApiErrorMessage(loginError, 'Unable to sign in. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page" aria-labelledby="login-title">
      <section className="login-panel">
        <p className="login-eyebrow">ADMIN WORKSPACE</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="login-intro">Sign in to manage Agrisell operations.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {!mfaRequired && (
            <div className="login-field">
              <label htmlFor="admin-email">Email</label>
              <div className="login-input">
                <Icon name="mail" size={18} />
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  disabled={isSubmitting}
                  placeholder="admin@agrisell.com"
                />
              </div>
            </div>
          )}

          {!mfaRequired && (
            <div className="login-field">
              <label htmlFor="admin-password">Password</label>
              <div className="login-input">
                <Icon name="lock" size={18} />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  placeholder="Enter your password"
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((isVisible) => !isVisible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  disabled={isSubmitting}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
            </div>
          )}

          {mfaRequired && (
            <div className="login-field">
              <label htmlFor="admin-mfa">Authentication code</label>
              <div className="login-input">
                <Icon name="shield" size={18} />
                <input
                  id="admin-mfa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
                  disabled={isSubmitting}
                  placeholder="000000"
                />
              </div>
              <small className="login-mfa-hint">
                Enter the 6-digit code from your authenticator app.
              </small>
            </div>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button className="login-submit" type="submit" disabled={isSubmitting}>
            <Icon name="lock" size={18} />
            {isSubmitting ? 'Verifying...' : mfaRequired ? 'Verify and continue' : 'Log in'}
          </button>
        </form>

        <p className="login-footnote">
          Admin accounts only. New administrator access is created by the system owner.
        </p>
      </section>

      <aside className="login-visual" aria-label="Agrisell admin summary">
        <div className="visual-logo-stage">
          <img src={agrisellLogo} alt="" />
        </div>
      </aside>
    </main>
  )
}
