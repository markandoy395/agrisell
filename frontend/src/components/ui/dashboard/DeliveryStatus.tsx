import { Icon } from '../Icon'

type DeliveryStatusProps = {
  panelMenu: 'commodity' | 'delivery' | null
  onNavigate: (section: string) => void
  onToggleMenu: () => void
  onExport: () => void
}

export function DeliveryStatus({ panelMenu, onNavigate, onToggleMenu, onExport }: DeliveryStatusProps) {
  return <article className="delivery-panel panel"><div className="panel-heading"><div><h2>Delivery status</h2><p>Today's fulfilment pulse</p></div><div className="panel-action"><button className="more-button" onClick={onToggleMenu} aria-label="Delivery options"><Icon name="more" size={20}/></button>{panelMenu === 'delivery' && <div className="dropdown-menu compact"><button onClick={() => onNavigate('Deliveries')}>Open deliveries</button><button onClick={onExport}>Export summary</button></div>}</div></div><div className="delivery-ring"><div><strong>84<span>%</span></strong><small>on track</small></div></div><div className="delivery-stats"><div><i className="dot-green"/><span>Delivered</span><strong>34</strong></div><div><i className="dot-orange"/><span>In transit</span><strong>12</strong></div><div><i className="dot-gray"/><span>Awaiting pickup</span><strong>5</strong></div></div><button className="text-link" onClick={() => onNavigate('Deliveries')}>Manage deliveries <Icon name="arrow" size={16}/></button></article>
}
