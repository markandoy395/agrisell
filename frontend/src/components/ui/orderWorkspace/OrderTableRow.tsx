import type { OrderRow, OrderWorkspaceRow } from '../../../types/dashboard'
import { getOrderInitials, getOrderStatusLabel } from '../../../utils/orderWorkspace'
import { Icon } from '../icon/Icon'

type OrderTableRowProps = {
  row: OrderWorkspaceRow
  isSelected: boolean
  onOpen: (order: OrderRow) => void
  onToggleSelection: (orderId: string) => void
}

export function OrderTableRow({ row, isSelected, onOpen, onToggleSelection }: OrderTableRowProps) {
  const overdue = row.order.status.trim().toLowerCase() === 'overdue'
  const statusIcon =
    overdue
      ? 'alert'
      : row.statusGroup === 'Success'
        ? 'check'
        : row.statusGroup === 'Pending'
          ? 'truck'
          : 'close'
  return (
    <tr>
      <td>
        <input
          className="order-checkbox"
          type="checkbox"
          aria-label={`Select ${row.trackingNumber}`}
          checked={isSelected}
          onChange={() => onToggleSelection(row.order.id)}
        />
      </td>
      <td>
        <span className="order-tracking-number">{row.trackingNumber}</span>
      </td>
      <td>
        <span className="order-person">
          <span className={`order-avatar tone-${row.avatarTone}`} aria-hidden="true">
            {getOrderInitials(row.order.customer)}
          </span>
          <span className="order-person-name">{row.order.customer}</span>
        </span>
      </td>
      <td>
        <span className="order-date">
          <Icon name="calendar" size={13} />
          {row.orderDate}
        </span>
      </td>
      <td>
        <span className="order-destination">{row.destination}</span>
      </td>
      <td>
        <span className="order-service-type">{row.serviceType}</span>
      </td>
      <td>
        <span className="order-person">
          <span className={`order-avatar tone-${row.courierTone}`} aria-hidden="true">
            {getOrderInitials(row.courier)}
          </span>
          <span className="order-person-name">{row.courier}</span>
        </span>
      </td>
      <td>
        <span className="order-date">{row.estimatedArrival}</span>
      </td>
      <td>
        <span
          className={`order-status-pill ${overdue ? 'overdue' : row.statusGroup.toLowerCase()}`}
        >
          <Icon name={statusIcon} size={13} />
          {getOrderStatusLabel(row.order.status)}
        </span>
      </td>
      <td>
        <button
          className="order-row-action"
          type="button"
          aria-label={`View and manage ${row.trackingNumber}`}
          onClick={() => onOpen(row.order)}
        >
          <Icon name="eye" size={15} />
          <span>Manage</span>
        </button>
      </td>
    </tr>
  )
}
