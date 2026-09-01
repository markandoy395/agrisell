import { useEffect, useState } from "react";
import type { LoginCredentials } from "./api/adminAuth";
import type { AuthenticatedAdmin } from "./api/adminAuth";
import { getAdminSession, loginAdmin, logoutAdmin } from "./api/adminAuth";
import { SmallScreenAccessGuard } from "./components/layout/SmallScreenAccessGuard";
import { AdminDashboardPage } from "./pages/adminDashboard/AdminDashboardPage";
import { LoginPage } from "./pages/login/LoginPage";
import agrisellLogo from "./assets/image/logo/Agrisell - Landscape Logo with out tagline.png";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

function AdminAppShell() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authenticatedAdmin, setAuthenticatedAdmin] = useState<AuthenticatedAdmin | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAdminSession()
      .then((session) => {
        if (!isMounted) return;

        setAuthenticatedAdmin(session.authenticated ? session.admin : null);
        setAuthStatus(session.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (isMounted) setAuthStatus("unauthenticated");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (credentials: LoginCredentials) => {
    const session = await loginAdmin(credentials);

    setAuthenticatedAdmin(session.authenticated ? session.admin : null);
    setAuthStatus(session.authenticated ? "authenticated" : "unauthenticated");
  };

  const handleSignOut = () => {
    void logoutAdmin().finally(() => {
      setAuthenticatedAdmin(null);
      setAuthStatus("unauthenticated");
    });
  };

  return (
    <>
      {authStatus === "checking" ? (
        <main className="auth-loading" aria-busy="true">
          <div className="auth-loading-card">
            <img className="auth-loading-logo" src={agrisellLogo} alt="Agrisell" />
            <div className="auth-loading-message">
              <span className="auth-loading-spinner" aria-hidden="true">
                <i />
              </span>
              <div>
                <strong>Checking secure admin session...</strong>
                <small>Confirming your Agrisell access</small>
              </div>
            </div>
          </div>
        </main>
      ) : authStatus === "authenticated" && authenticatedAdmin ? (
        <AdminDashboardPage admin={authenticatedAdmin} onSignOut={handleSignOut} />
      ) : (
        <LoginPage onLogin={handleLogin} />
      )}
    </>
  );
}

function App() {
  return (
    <SmallScreenAccessGuard>
      <AdminAppShell />
    </SmallScreenAccessGuard>
  );
}

export default App;
