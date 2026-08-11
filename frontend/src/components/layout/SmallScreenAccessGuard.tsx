import type { ReactNode } from "react";
import { useSmallScreenAccessBlock } from "../../hooks/useSmallScreenAccessBlock";
import "./SmallScreenAccessGuard.css";

type SmallScreenAccessGuardProps = {
  children: ReactNode;
};

export function SmallScreenAccessGuard({
  children,
}: SmallScreenAccessGuardProps) {
  const shouldBlockAccess = useSmallScreenAccessBlock();

  if (shouldBlockAccess) {
    return (
      <main
        className="small-screen-access-notice"
        aria-labelledby="small-screen-access-title"
      >
        <section className="small-screen-access-card">
          <div
            className="small-screen-access-brand"
            role="img"
            aria-label="Agrisell"
          >
            <span className="brand-mark" aria-hidden="true" />
          </div>
          <p className="small-screen-access-eyebrow">ADMIN WORKSPACE</p>
          <h1 id="small-screen-access-title">Desktop access required</h1>
          <p>
            Agrisell Admin cannot be accessed from mobile devices, tablets, or
            small screens. Please use a desktop or laptop to continue.
          </p>
        </section>
      </main>
    );
  }

  return children;
}
