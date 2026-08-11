import type { ChartPoint, OrderRow } from '../../types/dashboard'
import type { AdminOverviewData } from '../../types/adminData'
import { Icon } from '../../components/ui/icon/Icon'
import { CommodityMix } from '../../components/ui/dashboard/commodityMix/CommodityMix'
import { DeliveryStatus } from '../../components/ui/dashboard/deliveryStatus/DeliveryStatus'
import { RecentOrders } from '../../components/ui/dashboard/recentOrders/RecentOrders'
import { SalesOverview } from '../../components/ui/dashboard/salesOverview/SalesOverview'
import './OverviewDashboard.css'

type OverviewDashboardProps = {
  visibleOrders: OrderRow[]
  overview: AdminOverviewData
  metric: string
  metricOpen: boolean
  panelMenu: 'commodity' | 'delivery' | null
  activeChartPoint: ChartPoint | null
  tooltipPlacement: string
  onNavigate: (section: string) => void
  onToggleMetric: () => void
  onSelectMetric: (metric: string) => void
  onChartPointer: (clientX: number, element: HTMLDivElement) => void
  onChartLeave: () => void
  onTogglePanelMenu: (menu: 'commodity' | 'delivery') => void
  onExport: (message: string) => void
  onOpenOrder: (order: OrderRow) => void
}

export function OverviewDashboard(props: OverviewDashboardProps) {
  const { visibleOrders, overview, metric, metricOpen, panelMenu, activeChartPoint, tooltipPlacement, onNavigate, onToggleMetric, onSelectMetric, onChartPointer, onChartLeave, onTogglePanelMenu, onExport, onOpenOrder } = props

  return <div className="overview-dashboard">
    <section className="stat-grid" aria-label="Marketplace summary">
      <button className="stat-card accent-green clickable-card" onClick={() => onNavigate('Payments')}><span className="stat-top"><span className="stat-icon"><Icon name="trend" size={19}/></span><span className="growth positive">Live data</span></span><span className="stat-value">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(overview.totalSales)}</span><span className="stat-label">Total sales</span><span className="mini-bars green-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></button>
      <button className="stat-card accent-orange clickable-card" onClick={() => onNavigate('Orders')}><span className="stat-top"><span className="stat-icon"><Icon name="cart" size={19}/></span><span className="growth positive">Live data</span></span><span className="stat-value">{overview.totalOrders.toLocaleString('en-US')}</span><span className="stat-label">Total orders</span><span className="mini-bars orange-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></button>
      <button className="stat-card accent-lilac clickable-card" onClick={() => onNavigate('Farmers')}><span className="stat-top"><span className="stat-icon"><Icon name="sprout" size={19}/></span><span className="growth positive">Live data</span></span><span className="stat-value">{overview.activeFarmers.toLocaleString('en-US')}</span><span className="stat-label">Active farmers</span><span className="farmers-row"><small>verified farmer accounts</small></span></button>
      <button className="stat-card accent-blue clickable-card" onClick={() => onNavigate('Commodities')}><span className="stat-top"><span className="stat-icon"><Icon name="basket" size={19}/></span><span className="growth neutral">{overview.lowStock} low stock</span></span><span className="stat-value">{overview.activeListings.toLocaleString('en-US')}</span><span className="stat-label">Active listings</span><span className="listings-progress"><span><i/></span><small>database inventory</small></span></button>
    </section>

    <section className="insights-grid">
      <SalesOverview metric={metric} metricOpen={metricOpen} activeChartPoint={activeChartPoint} tooltipPlacement={tooltipPlacement} totalOrders={overview.totalOrders} totalSales={overview.totalSales} onToggleMetric={onToggleMetric} onSelectMetric={onSelectMetric} onChartPointer={onChartPointer} onChartLeave={onChartLeave}/>
      <CommodityMix items={overview.commodityMix} panelMenu={panelMenu} onNavigate={onNavigate} onToggleMenu={() => onTogglePanelMenu('commodity')} onExport={() => onExport('Commodity report downloaded.')}/>
    </section>

    <section className="lower-grid">
      <RecentOrders orders={visibleOrders} onNavigate={onNavigate} onOpenOrder={onOpenOrder}/>
      <DeliveryStatus items={overview.deliveryStatuses} panelMenu={panelMenu} onNavigate={onNavigate} onToggleMenu={() => onTogglePanelMenu('delivery')} onExport={() => onExport('Delivery summary downloaded.')}/>
    </section>
  </div>
}
