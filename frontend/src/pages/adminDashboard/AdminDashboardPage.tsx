import type { AuthenticatedAdmin } from '../../api/adminAuth'
import { AdminDashboardDialogs } from './AdminDashboardDialogs'
import { DashboardNavigation } from './DashboardNavigation'
import { DashboardPageHeading } from './DashboardPageHeading'
import { DashboardWorkspace } from './DashboardWorkspace'
import { useAdminDashboardState } from './useAdminDashboardState'
import './AdminDashboardPage.css'
import './styles/controls/DashboardFilterFields.css'
import './styles/panels/DashboardStatRows.css'

type AdminDashboardPageProps = {
  admin: AuthenticatedAdmin
  onSignOut: () => void
}

export function AdminDashboardPage({ admin, onSignOut }: AdminDashboardPageProps) {
  const state = useAdminDashboardState(admin)
  return (
    <DashboardNavigation
      admin={admin}
      dialogs={<AdminDashboardDialogs admin={admin} state={state} />}
      onSignOut={onSignOut}
      state={state}
    >
      <DashboardPageHeading state={state} />
      <DashboardWorkspace admin={admin} state={state} />
    </DashboardNavigation>
  )
}
