import { Icon } from '../../components/ui/icon/Icon'
import { label } from '../../utils/delivery'
import { getOrderInitials } from '../../utils/orderWorkspace'
import { DeliveryLocationIcon } from './DeliveryLocationIcon'
import type { DeliveryActionsState } from './useDeliveryActions'
import type { DeliveryDataState } from './useDeliveryData'
import type { FarmerRiderRequest } from '../../types/delivery'
import {
  DELIVERY_PAGE_SIZE,
  deliveryStatusLabel,
  deliveryTone,
  scheduleParts,
} from './deliveryWorkspace.utils'

type DeliveryTableProps = {
  actions: DeliveryActionsState
  data: DeliveryDataState
  farmerRequests?: FarmerRiderRequest[]
}

export function DeliveryTable({ actions, data, farmerRequests }: DeliveryTableProps) {
  const offset = (data.currentPage - 1) * DELIVERY_PAGE_SIZE
  const pageRows = data.sorted.slice(offset, offset + DELIVERY_PAGE_SIZE)
  const pageNumbers = Array.from({ length: data.totalPages }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === data.totalPages || Math.abs(n - data.currentPage) <= 1)
  return (
    <div className="order-board delivery-list-panel">
      <div className="order-table-wrap">
        <table className="order-table delivery-table">
          <colgroup>
            <col className="delivery-number-col" />
            <col className="delivery-order-col" />
            <col className="delivery-rider-col" />
            <col className="delivery-pickup-col" />
            <col className="delivery-destination-col" />
            <col className="delivery-schedule-col" />
            <col className="delivery-status-col" />
            <col className="delivery-actions-col" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Order ID</th>
              <th>Rider</th>
              <th>Pickup</th>
              <th>Destination</th>
              <th>Schedule</th>
              <th>Status</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((delivery, index) => {
              const [scheduleDate, scheduleTime] = scheduleParts(delivery.estimated_delivery_time)
              const tone = deliveryTone(delivery, data.now)
              return (
                <tr key={delivery.delivery_id}>
                  <td>
                    <span className="order-index-number">
                      {(data.currentPage - 1) * DELIVERY_PAGE_SIZE + index + 1}
                    </span>
                  </td>
                  <td>
                    <span className="order-tracking-number">ORD-{delivery.order_id}</span>
                    <span className="sr-only">
                      Delivery {delivery.delivery_id} · Order #{delivery.order_id}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const activeInvite = farmerRequests?.find(
                        (r) => r.delivery_id === delivery.delivery_id && r.status === 'pending',
                      )
                      return (
                        <span className="order-person">
                          <span className="order-avatar tone-green" aria-hidden="true">
                            {delivery.rider_name ? getOrderInitials(delivery.rider_name) : '—'}
                          </span>
                          <span className="order-person-name">
                            {delivery.rider_name || 'Unassigned'}
                            {activeInvite && (
                              <span
                                className="delivery-farmer-invite-badge"
                                title={`Farmer requested ${activeInvite.rider_name}`}
                              >
                                🌾 Invite: {activeInvite.rider_name}
                              </span>
                            )}
                          </span>
                        </span>
                      )
                    })()}
                  </td>
                  <td>
                    <span className="delivery-location order-destination">
                      <DeliveryLocationIcon />
                      {delivery.pickup_location || 'Not set'}
                    </span>
                  </td>
                  <td>
                    <span className="delivery-location order-destination">
                      <DeliveryLocationIcon />
                      {delivery.dropoff_location || 'Not set'}
                    </span>
                  </td>
                  <td>
                    <span className="delivery-schedule order-date">
                      <Icon name="calendar" size={13} />
                      <span>
                        {scheduleDate}
                        <small>{scheduleTime}</small>
                      </span>
                    </span>
                  </td>
                  <td aria-label={label(delivery.delivery_status)}>
                    <span className={`order-status-pill delivery-status-pill ${tone}`}>
                      <i />
                      {deliveryStatusLabel(delivery, data.now)}
                    </span>
                  </td>
                  <td>
                    <div className="delivery-row-actions">
                      <button
                        className="order-row-action delivery-row-menu"
                        type="button"
                        onClick={(event) =>
                          actions.openActions(delivery.delivery_id, event.currentTarget)
                        }
                        aria-label={`Actions for delivery ${delivery.delivery_id}`}
                        aria-haspopup="menu"
                        aria-expanded={actions.actionMenu?.deliveryId === delivery.delivery_id}
                      >
                        <Icon name="more" size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!data.loading && !data.filtered.length && (
          <p className="order-empty-state">No matching deliveries found.</p>
        )}
      </div>
      <div className="order-table-footer">
        <span>
          Showing {data.filtered.length ? (data.currentPage - 1) * DELIVERY_PAGE_SIZE + 1 : 0} to{' '}
          {Math.min(data.currentPage * DELIVERY_PAGE_SIZE, data.filtered.length)} of{' '}
          {data.filtered.length} deliveries
        </span>
        <nav className="order-pagination" aria-label="Delivery pages">
          <button
            type="button"
            aria-label="Previous page"
            disabled={data.currentPage === 1}
            onClick={() => data.setPage(data.currentPage - 1)}
          >
            Prev
          </button>
          {pageNumbers.map((number) => (
            <button
              type="button"
              className={number === data.currentPage ? 'is-active' : ''}
              aria-current={number === data.currentPage ? 'page' : undefined}
              key={number}
              onClick={() => data.setPage(number)}
            >
              {number}
            </button>
          ))}
          <button
            type="button"
            aria-label="Next page"
            disabled={data.currentPage === data.totalPages}
            onClick={() => data.setPage(data.currentPage + 1)}
          >
            Next
          </button>
        </nav>
      </div>
    </div>
  )
}
