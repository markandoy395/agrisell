import type { AuthenticatedAdmin } from '../../api/adminAuth'
import { DashboardEntityWorkspace } from './DashboardEntityWorkspace'
import { DashboardLoadingState } from './DashboardLoadingState'
import { DashboardPrimaryWorkspace } from './DashboardPrimaryWorkspace'
import type { AdminDashboardState } from './useAdminDashboardState'

const PRIMARY_SECTIONS = new Set([
  'Overview',
  'Orders',
  'Users',
  'Commodities',
  'Products / Commodities',
  'Categories',
  'Deliveries',
  'Payments',
  'Sales & Discounts',
  'Safety & SOS',
  'Customer Support',
  'Support',
  'Settings',
])

type DashboardWorkspaceProps = {
  admin: AuthenticatedAdmin
  state: AdminDashboardState
}

export function DashboardWorkspace({ admin, state }: DashboardWorkspaceProps) {
  if (state.database.isLoading) return <DashboardLoadingState />
  if (state.database.error) {
    return (
      <section className="database-data-state is-error" role="alert">
        {state.database.error}
      </section>
    )
  }
  if (!state.database.data) return null
  return PRIMARY_SECTIONS.has(state.activeNav) ? (
    <DashboardPrimaryWorkspace admin={admin} data={state.database.data} state={state} />
  ) : (
    <DashboardEntityWorkspace data={state.database.data} state={state} />
  )
}
