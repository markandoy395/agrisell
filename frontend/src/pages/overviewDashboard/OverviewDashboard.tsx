import type { OrderRow } from '../../types/dashboard'
import type { AdminOverviewData } from '../../types/adminData'
import { CommodityMix } from '../../components/ui/dashboard/commodityMix/CommodityMix'
import { DeliveryStatus } from '../../components/ui/dashboard/deliveryStatus/DeliveryStatus'
import { RecentOrders } from '../../components/ui/dashboard/recentOrders/RecentOrders'
import { SalesOverview } from '../../components/ui/dashboard/salesOverview/SalesOverview'
import { WorkspaceStatsGrid } from '../../components/ui/workspaceStats/WorkspaceStatsGrid'
import './OverviewDashboard.css'

type OverviewDashboardProps = {
  visibleOrders: OrderRow[]
  overview: AdminOverviewData
  metric: string
  metricOpen: boolean
  panelMenu: 'commodity' | 'delivery' | null
  activeChartIndex: number | null
  onNavigate: (section: string) => void
  onToggleMetric: () => void
  onSelectMetric: (metric: string) => void
  onChartPointer: (clientX: number, element: HTMLDivElement, pointCount: number) => void
  onChartLeave: () => void
  onTogglePanelMenu: (menu: 'commodity' | 'delivery') => void
  onExport: (message: string) => void
  onOpenOrder: (order: OrderRow) => void
}

export function OverviewDashboard(props: OverviewDashboardProps) {
  const {
    visibleOrders,
    overview,
    metric,
    metricOpen,
    panelMenu,
    activeChartIndex,
    onNavigate,
    onToggleMetric,
    onSelectMetric,
    onChartPointer,
    onChartLeave,
    onTogglePanelMenu,
    onExport,
    onOpenOrder,
  } = props

  return (
    <div className="overview-dashboard">
      <WorkspaceStatsGrid
        ariaLabel="Marketplace summary"
        cards={[
          {
            detail: 'Completed marketplace sales',
            icon: 'trend',
            label: 'Total sales',
            onClick: () => onNavigate('Payments'),
            trend: 'Live',
            value: new Intl.NumberFormat('en-PH', {
              style: 'currency',
              currency: 'PHP',
            }).format(overview.totalSales),
          },
          {
            detail: 'All marketplace orders',
            icon: 'cart',
            label: 'Total orders',
            onClick: () => onNavigate('Orders'),
            trend: 'Live',
            value: overview.totalOrders.toLocaleString('en-US'),
          },
          {
            detail: 'Verified farmer accounts',
            icon: 'sprout',
            label: 'Active farmers',
            onClick: () => onNavigate('Farmers'),
            trend: 'Live',
            value: overview.activeFarmers.toLocaleString('en-US'),
          },
          {
            detail: 'Database inventory',
            icon: 'basket',
            label: 'Active listings',
            onClick: () => onNavigate('Commodities'),
            trend: `${overview.lowStock} low`,
            value: overview.activeListings.toLocaleString('en-US'),
          },
        ]}
      />

      <section className="insights-grid">
        <SalesOverview
          metric={metric}
          metricOpen={metricOpen}
          activeChartIndex={activeChartIndex}
          salesTrend={overview.salesTrend}
          totalOrders={overview.totalOrders}
          totalSales={overview.totalSales}
          onToggleMetric={onToggleMetric}
          onSelectMetric={onSelectMetric}
          onChartPointer={onChartPointer}
          onChartLeave={onChartLeave}
        />
        <CommodityMix
          items={overview.commodityMix}
          panelMenu={panelMenu}
          onNavigate={onNavigate}
          onToggleMenu={() => onTogglePanelMenu('commodity')}
          onExport={() => onExport('Commodity report downloaded.')}
        />
      </section>

      <section className="lower-grid">
        <RecentOrders orders={visibleOrders} onNavigate={onNavigate} onOpenOrder={onOpenOrder} />
        <DeliveryStatus
          items={overview.deliveryStatuses}
          panelMenu={panelMenu}
          onNavigate={onNavigate}
          onToggleMenu={() => onTogglePanelMenu('delivery')}
          onExport={() => onExport('Delivery summary downloaded.')}
        />
      </section>
    </div>
  )
}
