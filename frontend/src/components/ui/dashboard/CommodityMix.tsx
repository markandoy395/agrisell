import { commodityRows } from '../../../data/dashboardMock'
import { Icon } from '../Icon'

type CommodityMixProps = {
  panelMenu: 'commodity' | 'delivery' | null
  onNavigate: (section: string) => void
  onToggleMenu: () => void
  onExport: () => void
}

export function CommodityMix({ panelMenu, onNavigate, onToggleMenu, onExport }: CommodityMixProps) {
  return <article className="category-panel panel"><div className="panel-heading"><div><h2>Commodity mix</h2><p>Orders by product category</p></div><div className="panel-action"><button className="more-button" onClick={onToggleMenu} aria-label="Commodity options"><Icon name="more" size={20}/></button>{panelMenu === 'commodity' && <div className="dropdown-menu compact"><button onClick={() => onNavigate('Commodities')}>View categories</button><button onClick={onExport}>Export report</button></div>}</div></div><div className="donut-area"><div className="donut"><div><strong>954</strong><span>orders</span></div></div><div className="donut-legend">{commodityRows.map((item) => <div key={item.name}><i style={{ background: item.color }}/><span>{item.name}</span><strong>{item.orders}</strong></div>)}</div></div><button className="text-link" onClick={() => onNavigate('Commodities')}>View commodity report <Icon name="arrow" size={16}/></button></article>
}
