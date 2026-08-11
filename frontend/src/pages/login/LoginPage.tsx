import { useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/adminAuth";
import type { LoginCredentials } from "../../api/adminAuth";
import { Icon } from "../../components/ui/icon/Icon";
import agrisellLogo from "../../assets/image/logo/Agrisell - Landscape Logo.png";
import "./LoginPage.css";

type LoginPageProps = {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError("Enter your admin email and password.");
      return;
    }

    if (!trimmedEmail.includes("@")) {
      setError("Enter a valid admin email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await onLogin({ email: trimmedEmail, password });
    } catch (loginError) {
      setError(
        getApiErrorMessage(loginError, "Unable to sign in. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page" aria-labelledby="login-title">
      <section className="login-panel">
        <p className="login-eyebrow">ADMIN WORKSPACE</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="login-intro">Sign in to manage Agrisell operations.</p>

        <form className="login-form" onSubmit={handleSubmit}>
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

          <div className="login-field">
            <label htmlFor="admin-password">Password</label>
            <div className="login-input">
              <Icon name="lock" size={18} />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
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
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                disabled={isSubmitting}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
              </button>
            </div>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="login-submit"
            type="submit"
            disabled={isSubmitting}
          >
            <Icon name="lock" size={18} />
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="login-footnote">
          Admin accounts only. New administrator access is created by the system
          owner.
        </p>
      </section>

      <aside className="login-visual" aria-label="Agrisell admin summary">
        <div className="visual-logo-stage">
          <img src={agrisellLogo} alt="" />
        </div>
      </aside>
    </main>
  );
}
