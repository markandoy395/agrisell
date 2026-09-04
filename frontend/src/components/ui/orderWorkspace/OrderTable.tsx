import { useEffect, useRef } from "react";
import type { OrderRow, OrderWorkspaceRow } from "../../../types/dashboard";
import {
  getDeliveryStatus,
  getOrderInitials,
} from "../../../utils/orderWorkspace";
import { Icon } from "../icon/Icon";

type OrderTableProps = {
  activePage: number;
  allVisibleSelected: boolean;
  orders: OrderWorkspaceRow[];
  pageNumbers: number[];
  partiallyVisibleSelected: boolean;
  selectedOrderIds: Set<string>;
  totalCount: number;
  totalPages: number;
  onOpenOrder: (order: OrderRow) => void;
  onPageChange: (page: number | ((currentPage: number) => number)) => void;
  onToggleAllVisible: () => void;
  onToggleOrderSelection: (orderId: string) => void;
};

export function OrderTable({
  activePage,
  allVisibleSelected,
  orders,
  pageNumbers,
  partiallyVisibleSelected,
  selectedOrderIds,
  totalCount,
  totalPages,
  onOpenOrder,
  onPageChange,
  onToggleAllVisible,
  onToggleOrderSelection,
}: OrderTableProps) {
  const selectAllOrdersRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllOrdersRef.current) {
      selectAllOrdersRef.current.indeterminate = partiallyVisibleSelected;
    }
  }, [partiallyVisibleSelected]);

  return (
    <div className="order-board">
      <div className="order-table-wrap">
        <table className="order-table">
          <colgroup>
            <col className="order-col-select" />
            <col className="order-col-tracking" />
            <col className="order-col-recipient" />
            <col className="order-col-date" />
            <col className="order-col-destination" />
            <col className="order-col-service" />
            <col className="order-col-courier" />
            <col className="order-col-arrival" />
            <col className="order-col-status" />
            <col className="order-col-action" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  ref={selectAllOrdersRef}
                  className="order-checkbox"
                  type="checkbox"
                  aria-label="Select all visible orders"
                  aria-checked={
                    partiallyVisibleSelected ? "mixed" : allVisibleSelected
                  }
                  checked={allVisibleSelected}
                  disabled={orders.length === 0}
                  onChange={onToggleAllVisible}
                />
              </th>
              <th>Tracking number</th>
              <th>Recipient name</th>
              <th>Order date</th>
              <th>Destination address</th>
              <th>Service type</th>
              <th>Courier</th>
              <th>Estimated arrival</th>
              <th>Order status</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((row) => {
              const deliveryStatus = getDeliveryStatus(row.statusGroup);

              return (
                <tr key={row.order.id}>
                  <td>
                    <input
                      className="order-checkbox"
                      type="checkbox"
                      aria-label={`Select ${row.trackingNumber}`}
                      checked={selectedOrderIds.has(row.order.id)}
                      onChange={() => onToggleOrderSelection(row.order.id)}
                    />
                  </td>
                  <td>
                    <span className="order-tracking-number">
                      {row.trackingNumber}
                    </span>
                  </td>
                  <td>
                    <span className="order-person">
                      <span
                        className={`order-avatar tone-${row.avatarTone}`}
                        aria-hidden="true"
                      >
                        {getOrderInitials(row.order.customer)}
                      </span>
                      <span className="order-person-name">
                        {row.order.customer}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="order-date"><Icon name="calendar" size={13} />{row.orderDate}</span>
                  </td>
                  <td>
                    <span className="order-destination">{row.destination}</span>
                  </td>
                  <td>
                    <span className="order-service-type">
                      {row.serviceType}
                    </span>
                  </td>
                  <td>
                    <span className="order-person">
                      <span
                        className={`order-avatar tone-${row.courierTone}`}
                        aria-hidden="true"
                      >
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
                      className={`order-status-pill ${deliveryStatus.toLowerCase()}`}
                    >
                      <Icon name={deliveryStatus === "Completed" ? "check" : deliveryStatus === "Delivering" ? "truck" : "close"} size={13} />
                      {deliveryStatus}
                    </span>
                  </td>
                  <td>
                    <button
                      className="order-row-action"
                      type="button"
                      aria-label={`Open ${row.trackingNumber}`}
                      onClick={() => onOpenOrder(row.order)}
                    >
                      <Icon name="more" size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="order-empty-state">No matching orders found.</div>
        )}
      </div>

      <div className="order-table-footer">
        <span>Showing {(activePage - 1) * 12 + (orders.length ? 1 : 0)} to {(activePage - 1) * 12 + orders.length} of {totalCount} orders</span>
        <nav className="order-pagination" aria-label="Order pages">
        <button
          type="button"
          disabled={activePage === 1}
          onClick={() => onPageChange((page) => Math.max(1, page - 1))}
          aria-label="Previous page"
        >
          Prev
        </button>
        {pageNumbers.map((page) => (
          <button
            className={activePage === page ? "is-active" : ""}
            type="button"
            key={page}
            onClick={() => onPageChange(page)}
            aria-current={activePage === page ? "page" : undefined}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          disabled={activePage === totalPages}
          onClick={() => onPageChange((page) => Math.min(totalPages, page + 1))}
          aria-label="Next page"
        >
          Next
        </button>
        </nav>
      </div>
    </div>
  );
}
