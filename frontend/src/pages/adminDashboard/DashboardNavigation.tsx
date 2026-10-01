import type { ReactNode } from 'react'
import type { AuthenticatedAdmin } from '../../api/adminAuth'
import { DashboardSidebar } from '../../components/layout/DashboardSidebar'
import { DashboardTopbar } from '../../components/layout/DashboardTopbar'
import { GlobalIssueBanner } from '../../components/ui/banner/GlobalIssueBanner'
import { useKeyboardArrowNavigation } from '../../hooks/useKeyboardArrowNavigation'
import type { AdminDashboardState } from './useAdminDashboardState'

type DashboardNavigationProps = {
  admin: AuthenticatedAdmin
  children: ReactNode
  dialogs: ReactNode
  onSignOut: () => void
  state: AdminDashboardState
}

export function DashboardNavigation({
  admin,
  children,
  dialogs,
  onSignOut,
  state,
}: DashboardNavigationProps) {
  useKeyboardArrowNavigation({
    activeNav: state.activeNav,
    onNavigate: state.navigate,
    permissions: admin.permissions,
  })

  return (
    <div
      className={`dashboard${[
        'Orders',
        'Users',
        'Farmers',
        'Commodities',
        'Products / Commodities',
        'Categories',
        'Deliveries',
        'Safety & SOS',
        'Customer Support',
        'Support',
        'Riders',
        'Logistics Companies',
      ].includes(state.activeNav) ? ' dashboard--table' : ''}`}
      data-keyboard-ready="true"
    >
      <DashboardSidebar
        activeNav={state.activeNav}
        profile={state.adminProfile}
        permissions={admin.permissions}
        onNavigate={state.navigate}
        onOpenHelp={() => state.setAccountTool('help')}
      />
      <main className="main-content">
        <DashboardTopbar
          activeNav={state.activeNav}
          search={state.search}
          notificationsOpen={state.notificationsOpen}
          notifications={state.notifications}
          onSearchChange={state.setSearch}
          onToggleNotifications={() => state.setNotificationsOpen((isOpen) => !isOpen)}
          onMarkNotificationsRead={state.markAllNotificationsRead}
          onHideNotification={state.hideNotification}
          onOpenBroadcast={() => state.setBroadcastModalOpen(true)}
          profile={state.adminProfile}
          profileOpen={state.topProfileOpen}

          onToggleProfile={() => state.setTopProfileOpen((isOpen) => !isOpen)}
          onOpenProfile={() => {
            state.setTopProfileOpen(false)
            state.setProfileEditorOpen(true)
          }}
          onOpenPreferences={() => {
            state.navigate('Settings')
            state.setTopProfileOpen(false)
          }}
          onOpenHelp={() => {
            state.setTopProfileOpen(false)
            state.setAccountTool('help')
          }}
          onOpenAccountAction={(action) => {
            state.setTopProfileOpen(false)
            state.setAccountTool(
              action === 'Change Password'
                ? 'password'
                : action === 'Contact Support'
                  ? 'support'
                  : 'feature',
            )
          }}
          onSignOut={() => {
            state.setTopProfileOpen(false)
            onSignOut()
          }}
        />
        <div className="page-content">
          <GlobalIssueBanner
            issue={state.globalIssue}
            onDismiss={state.dismissGlobalIssue}
          />
          {children}
        </div>
      </main>
      {dialogs}
    </div>
  )
}
