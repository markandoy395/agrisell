import type { OrderRow } from "../../../../types/dashboard";
import { Icon } from "../../icon/Icon";
import { Tooltip } from "../../tooltip/Tooltip";
import "./RecentOrders.css";

type RecentOrdersProps = {
  orders: OrderRow[];
  onNavigate: (section: string) => void;
  onOpenOrder: (order: OrderRow) => void;
};

const RECENT_ORDER_LIMIT = 4;

function getElapsedMinutes(time: string) {
  const normalizedTime = time.trim().toLowerCase();

  if (normalizedTime === "just now") return 0;

  const match = normalizedTime.match(
    /^(\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours|day|days)\s+ago$/,
  );

  if (!match) return Number.MAX_SAFE_INTEGER;

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit.startsWith("min")) return amount;
  if (unit.startsWith("hr") || unit.startsWith("hour")) return amount * 60;
  if (unit.startsWith("day")) return amount * 24 * 60;

  return Number.MAX_SAFE_INTEGER;
}

export function RecentOrders({
  orders,
  onNavigate,
  onOpenOrder,
}: RecentOrdersProps) {
  const recentOrders = orders
    .map((order, index) => ({
      order,
      index,
      elapsedMinutes: getElapsedMinutes(order.time),
    }))
    .sort(
      (currentOrder, nextOrder) =>
        currentOrder.elapsedMinutes - nextOrder.elapsedMinutes ||
        currentOrder.index - nextOrder.index,
    )
    .slice(0, RECENT_ORDER_LIMIT)
    .map(({ order }) => order);

  return (
    <article className="orders-panel panel">
      <div className="panel-heading">
        <div>
          <h2>Recent orders</h2>
          <p>Latest activity across your marketplace</p>
        </div>
        <button className="outline-button" onClick={() => onNavigate("Orders")}>
          View all <Icon name="arrow" size={16} />
        </button>
      </div>
      <div className="orders-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ORDER</th>
              <th>CUSTOMER</th>
              <th>COMMODITY</th>
              <th>TOTAL</th>
              <th>STATUS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.id}</strong>
                  <small>{row.time}</small>
                </td>
                <td>
                  <div className="customer">
                    <span className="customer-avatar">{row.initial}</span>
                    <span>{row.customer}</span>
                  </div>
                </td>
                <td>
                  <span className="commodity-cell">
                    {row.item}
                    <small>{row.qty}</small>
                  </span>
                </td>
                <td>
                  <strong>{row.total}</strong>
                </td>
                <td>
                  <span className={`status ${row.tone}`}>
                    <i />
                    {row.status}
                  </span>
                </td>
                <td>
                  <Tooltip content={`View ${row.id}`}>
                    <button
                      className="table-more"
                      onClick={() => onOpenOrder(row)}
                      aria-label={`View ${row.id}`}
                    >
                      <Icon name="more" size={18} />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recentOrders.length === 0 && (
          <div className="no-orders">No matching orders found.</div>
        )}
      </div>
    </article>
  );
}
