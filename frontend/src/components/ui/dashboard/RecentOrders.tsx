import type { OrderRow } from '../../../types/dashboard'
import { Icon } from '../Icon'

type RecentOrdersProps = {
  orders: OrderRow[]
  onNavigate: (section: string) => void
  onOpenOrder: (order: OrderRow) => void
}

export function RecentOrders({ orders, onNavigate, onOpenOrder }: RecentOrdersProps) {
  return <article className="orders-panel panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>Latest activity across your marketplace</p></div><button className="outline-button" onClick={() => onNavigate('Orders')}>View all <Icon name="arrow" size={16}/></button></div><div className="orders-table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>COMMODITY</th><th>TOTAL</th><th>STATUS</th><th></th></tr></thead><tbody>{orders.map((row) => <tr key={row.id}><td><strong>{row.id}</strong><small>{row.time}</small></td><td><div className="customer"><span className="customer-avatar">{row.initial}</span><span>{row.customer}</span></div></td><td><span className="commodity-cell">{row.item}<small>{row.qty}</small></span></td><td><strong>{row.total}</strong></td><td><span className={`status ${row.tone}`}><i/>{row.status}</span></td><td><button className="table-more" onClick={() => onOpenOrder(row)} aria-label={`View ${row.id}`}><Icon name="more" size={18}/></button></td></tr>)}</tbody></table>{orders.length === 0 && <div className="no-orders">No matching orders found.</div>}</div></article>
}
