import {
  createAdministrator,
  saveAdminPreferences,
  setAdministratorEnabled,
  updateAdministratorPrivileges,
} from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { AuthenticatedAdmin } from '../../api/adminAuth'
import type { AdminDatabaseData } from '../../types/adminData'
import type { EntityRecord } from '../../types/dashboard'
import { CategoryWorkspace } from '../categoryWorkspace/CategoryWorkspace'
import { CommodityWorkspace } from '../commodityWorkspace/CommodityWorkspace'
import { DeliveryWorkspace } from '../deliveryWorkspace/DeliveryWorkspace'
import { OrderWorkspace } from '../orderWorkspace/OrderWorkspace'
import { OverviewDashboard } from '../overviewDashboard/OverviewDashboard'
import { PaymentWorkspace } from '../paymentWorkspace/PaymentWorkspace'
import { SafetyWorkspace } from '../safetyWorkspace/SafetyWorkspace'
import { SaleWorkspace } from '../saleWorkspace/SaleWorkspace'
import { SettingsWorkspace } from '../settingsWorkspace/SettingsWorkspace'
import { SupportWorkspace } from '../supportWorkspace/SupportWorkspace'
import { UserWorkspace } from '../userWorkspace/UserWorkspace'
import type { AdminDashboardState } from './useAdminDashboardState'

const EMPTY_ENTITY_RECORDS: EntityRecord[] = []

type DashboardPrimaryWorkspaceProps = {
  admin: AuthenticatedAdmin
  data: AdminDatabaseData
  state: AdminDashboardState
}

export function DashboardPrimaryWorkspace({ admin, data, state }: DashboardPrimaryWorkspaceProps) {
  if (state.activeNav === 'Overview') {
    return (
      <OverviewDashboard
        overview={data.overview}
        visibleOrders={state.visibleOrders}
        metric={state.metric}
        metricOpen={state.metricOpen}
        panelMenu={state.panelMenu}
        activeChartIndex={state.chartHover}
        onNavigate={state.navigate}
        onToggleMetric={() => state.setMetricOpen(!state.metricOpen)}
        onSelectMetric={(metric) => {
          state.setMetric(metric)
          state.setMetricOpen(false)
        }}
        onChartPointer={state.updateChartTooltip}
        onChartLeave={() => state.setChartHover(null)}
        onTogglePanelMenu={(menu) => state.setPanelMenu(state.panelMenu === menu ? null : menu)}
        onExport={(message) => {
          state.setPanelMenu(null)
          state.showToast(message)
        }}
        onOpenOrder={state.openOrder}
      />
    )
  }
  if (state.activeNav === 'Orders') {
    return (
      <OrderWorkspace
        orders={state.visibleOrders}
        users={data.users}
        onOrdersChanged={state.database.refresh}
        onManageDelivery={state.openDelivery}
      />
    )
  }
  if (state.activeNav === 'Users') {
    return (
      <UserWorkspace
        onAdd={() => state.setCreateUserType('user')}
        onOpenUser={state.setSelectedUser}
        users={data.users}
      />
    )
  }
  if (state.activeNav === 'Deliveries') {
    return (
      <DeliveryWorkspace
        search={state.search}
        initialDeliveryId={state.deliveryTargetId}
        onInitialDeliveryOpened={() => state.setDeliveryTargetId(null)}
        fallbackRecords={data.entityRows?.['Deliveries'] ?? EMPTY_ENTITY_RECORDS}
        onNotice={state.showToast}
        onReportIssue={(issue) => state.reportGlobalIssue('Deliveries', issue)}
        onDataChanged={() => {
          void state.database.refresh().catch(() => undefined)
        }}
      />
    )
  }
  if (state.activeNav === 'Payments') {
    return (
      <PaymentWorkspace
        paymentActivityBars={data.overview.paymentActivityBars}
        payments={data.payments}
        search={state.search}
        created={[]}
        activeOnly={state.activeOnly}
        onToggleFilter={() => state.setActiveOnly(!state.activeOnly)}
        period={state.period}
        canManage={
          admin.permissions.includes('payments:manage') ||
          admin.permissions.includes('admin:manage')
        }
        onDataChanged={async () => {
          await state.database.refresh()
        }}
        onNotice={state.showToast}
      />
    )
  }
  if (state.activeNav === 'Sales & Discounts') {
    return <SaleWorkspace onNotice={state.showToast} />
  }
  if (state.activeNav === 'Commodities' || state.activeNav === 'Products / Commodities') {
    return <CommodityWorkspace onNotice={state.showToast} />
  }
  if (state.activeNav === 'Categories') {
    return <CategoryWorkspace onNotice={state.showToast} />
  }
  if (state.activeNav === 'Safety & SOS') {
    return <SafetyWorkspace onNotice={state.showToast} />
  }
  if (state.activeNav === 'Customer Support' || state.activeNav === 'Support') {
    return <SupportWorkspace onNotice={state.showToast} users={data.users} />
  }
  if (state.activeNav !== 'Settings') return null
  return (
    <SettingsWorkspace
      administrators={data.administrators}
      canManageAdmins={admin.permissions.includes('admin:manage')}
      autoApprove={state.autoApprove}
      digest={state.digest}
      onToggleApprove={() => state.setAutoApprove(!state.autoApprove)}
      onToggleDigest={() => state.setDigest(!state.digest)}
      onReset={async () => {
        await saveAdminPreferences({ autoApprove: true, digest: true })
        state.setAutoApprove(true)
        state.setDigest(true)
        state.notifyUpdate(
          'Preferences restored',
          'Workspace preferences were restored to defaults.',
        )
      }}
      onSave={async () => {
        await saveAdminPreferences({ autoApprove: state.autoApprove, digest: state.digest })
        state.notifyUpdate('Preferences saved', 'Workspace preferences saved.')
      }}
      onCreateAdministrator={async (input) => {
        await createAdministrator(input)
        await state.database.refresh()
        state.notifyUpdate(
          'Administrator created',
          `${input.firstName} ${input.lastName} can now sign in with the selected privileges.`,
        )
      }}
      onUpdateAdministratorPrivileges={async (userId, permissions) => {
        await updateAdministratorPrivileges(userId, permissions)
        await state.database.refresh()
        state.notifyUpdate(
          'Administrator privileges updated',
          "The administrator's dashboard privileges were updated.",
        )
      }}
      onSetAdministratorEnabled={async (userId, enabled) => {
        try {
          await setAdministratorEnabled(userId, enabled)
          await state.database.refresh()
          state.notifyUpdate(
            enabled ? 'Administrator enabled' : 'Administrator disabled',
            enabled ? 'The administrator can sign in again.' : 'Administrator access was revoked.',
          )
        } catch (error) {
          state.showToast(
            getApiErrorMessage(error, 'The administrator status could not be updated.'),
          )
          throw error
        }
      }}
    />
  )
}
