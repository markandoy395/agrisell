import type { ChartPoint, OrderRow } from '../types/dashboard'
import { Icon } from '../components/ui/Icon'
import { CommodityMix } from '../components/ui/dashboard/CommodityMix'
import { DeliveryStatus } from '../components/ui/dashboard/DeliveryStatus'
import { RecentOrders } from '../components/ui/dashboard/RecentOrders'
import { SalesOverview } from '../components/ui/dashboard/SalesOverview'

type OverviewDashboardProps = {
  visibleOrders: OrderRow[]
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
  const { visibleOrders, metric, metricOpen, panelMenu, activeChartPoint, tooltipPlacement, onNavigate, onToggleMetric, onSelectMetric, onChartPointer, onChartLeave, onTogglePanelMenu, onExport, onOpenOrder } = props

  return <>
    <section className="stat-grid">
      <button className="stat-card accent-green clickable-card" onClick={() => onNavigate('Payments')}><span className="stat-top"><span className="stat-icon"><Icon name="trend" size={19}/></span><span className="growth positive">+12.5%</span></span><span className="stat-value">PHP 186,420<span>.00</span></span><span className="stat-label">Total sales</span><span className="mini-bars green-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></button>
      <button className="stat-card accent-orange clickable-card" onClick={() => onNavigate('Orders')}><span className="stat-top"><span className="stat-icon"><Icon name="cart" size={19}/></span><span className="growth positive">+8.2%</span></span><span className="stat-value">1,248</span><span className="stat-label">Total orders</span><span className="mini-bars orange-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></button>
      <button className="stat-card accent-lilac clickable-card" onClick={() => onNavigate('Farmers')}><span className="stat-top"><span className="stat-icon"><Icon name="sprout" size={19}/></span><span className="growth positive">+4 this week</span></span><span className="stat-value">86</span><span className="stat-label">Active farmers</span><span className="farmers-row"><span className="stacked-avatars"><b>JD</b><b>MR</b><b>AC</b><b>+83</b></span><small>verified farms</small></span></button>
      <button className="stat-card accent-blue clickable-card" onClick={() => onNavigate('Commodities')}><span className="stat-top"><span className="stat-icon"><Icon name="basket" size={19}/></span><span className="growth neutral">42 low stock</span></span><span className="stat-value">342</span><span className="stat-label">Active listings</span><span className="listings-progress"><span><i/></span><small>78% in stock</small></span></button>
    </section>

    <section className="insights-grid">
      <SalesOverview metric={metric} metricOpen={metricOpen} activeChartPoint={activeChartPoint} tooltipPlacement={tooltipPlacement} onToggleMetric={onToggleMetric} onSelectMetric={onSelectMetric} onChartPointer={onChartPointer} onChartLeave={onChartLeave}/>
      <CommodityMix panelMenu={panelMenu} onNavigate={onNavigate} onToggleMenu={() => onTogglePanelMenu('commodity')} onExport={() => onExport('Commodity report downloaded.')}/>
    </section>

    <section className="lower-grid">
      <RecentOrders orders={visibleOrders} onNavigate={onNavigate} onOpenOrder={onOpenOrder}/>
      <DeliveryStatus panelMenu={panelMenu} onNavigate={onNavigate} onToggleMenu={() => onTogglePanelMenu('delivery')} onExport={() => onExport('Delivery summary downloaded.')}/>
    </section>
  </>
}
