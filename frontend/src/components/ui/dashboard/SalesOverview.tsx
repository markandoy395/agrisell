import { chartPoints } from '../../../data/dashboardMock'
import type { ChartPoint } from '../../../types/dashboard'
import { Icon } from '../Icon'

type SalesOverviewProps = {
  metric: string
  metricOpen: boolean
  activeChartPoint: ChartPoint | null
  tooltipPlacement: string
  onToggleMetric: () => void
  onSelectMetric: (metric: string) => void
  onChartPointer: (clientX: number, element: HTMLDivElement) => void
  onChartLeave: () => void
}

export function SalesOverview({ metric, metricOpen, activeChartPoint, tooltipPlacement, onToggleMetric, onSelectMetric, onChartPointer, onChartLeave }: SalesOverviewProps) {
  return <article className="sales-panel panel">
    <div className="panel-heading"><div><h2>Sales overview</h2><p>Marketplace performance over time</p></div><div className="panel-action"><button className="ghost-button" onClick={onToggleMetric}>{metric}<Icon name="chevron" size={15}/></button>{metricOpen && <div className="dropdown-menu compact"><button onClick={() => onSelectMetric('Revenue')}>Revenue</button><button onClick={() => onSelectMetric('Orders')}>Orders</button></div>}</div></div>
    <div className="sales-summary"><strong>{metric === 'Revenue' ? 'PHP 186,420' : '1,248 orders'}</strong><span><b>Up 12.5%</b> vs. previous month</span></div>
    <div className="chart-wrap"><div className="chart-y"><span>PHP 50k</span><span>PHP 37.5k</span><span>PHP 25k</span><span>PHP 12.5k</span><span>PHP 0</span></div><div className="line-chart" aria-label="Sales increased over the last month" onPointerEnter={(event) => onChartPointer(event.clientX, event.currentTarget)} onPointerMove={(event) => onChartPointer(event.clientX, event.currentTarget)} onPointerLeave={onChartLeave}><div className="grid-line line-1"/><div className="grid-line line-2"/><div className="grid-line line-3"/><div className="grid-line line-4"/><div className="grid-line line-5"/><svg viewBox="0 0 650 218" preserveAspectRatio="none" role="img"><defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5c9f69" stopOpacity=".24"/><stop offset="100%" stopColor="#5c9f69" stopOpacity="0"/></linearGradient></defs><path d="M0,172 C25,162 37,164 58,151 S94,145 113,153 S146,167 169,149 S202,118 221,130 S249,151 272,132 S305,117 329,125 S354,146 382,126 S414,105 437,118 S473,112 493,95 S523,93 546,83 S579,65 598,78 S622,86 650,36 L650,218 L0,218 Z" fill="url(#salesFill)"/><path d="M0,172 C25,162 37,164 58,151 S94,145 113,153 S146,167 169,149 S202,118 221,130 S249,151 272,132 S305,117 329,125 S354,146 382,126 S414,105 437,118 S473,112 493,95 S523,93 546,83 S579,65 598,78 S622,86 650,36" fill="none" stroke="#5b9e67" strokeWidth="3" vectorEffect="non-scaling-stroke"/><circle cx="650" cy="36" r="5" fill="#fff" stroke="#5b9e67" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg>{activeChartPoint && <><span className="chart-point-marker" style={{ left: activeChartPoint.left, top: activeChartPoint.top }}/><div className={`chart-tooltip dynamic-chart-tooltip${tooltipPlacement}`} style={{ left: activeChartPoint.left, top: activeChartPoint.top }}><i className="tooltip-rail"/><div><strong>{activeChartPoint.title}</strong><span>{activeChartPoint.date}</span><b>{activeChartPoint.events}</b><p><em>{activeChartPoint.change}</em> from prev. day</p></div></div></>}<div className="chart-x">{chartPoints.map((point) => <span key={point.date}>{point.date.replace('Mon, ', '')}</span>)}</div></div></div>
  </article>
}
