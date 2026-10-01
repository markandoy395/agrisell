import { useEffect, useRef } from 'react'
import type { OrderRow, OrderWorkspaceRow } from '../../../types/dashboard'
import { OrderTableRow } from './OrderTableRow'

type OrderTableProps = {
  activePage: number
  allVisibleSelected: boolean
  orders: OrderWorkspaceRow[]
  pageNumbers: number[]
  partiallyVisibleSelected: boolean
  selectedOrderIds: Set<string>
  totalCount: number
  totalPages: number
  onOpenOrder: (order: OrderRow) => void
  onPageChange: (page: number | ((currentPage: number) => number)) => void
  onToggleAllVisible: () => void
  onToggleOrderSelection: (orderId: string) => void
}

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
  const selectAllOrdersRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectAllOrdersRef.current) {
      selectAllOrdersRef.current.indeterminate = partiallyVisibleSelected
    }
  }, [partiallyVisibleSelected])

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
                  aria-checked={partiallyVisibleSelected ? 'mixed' : allVisibleSelected}
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((row) => (
              <OrderTableRow
                key={row.order.id}
                row={row}
                isSelected={selectedOrderIds.has(row.order.id)}
                onOpen={onOpenOrder}
                onToggleSelection={onToggleOrderSelection}
              />
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div className="order-empty-state">No matching orders found.</div>}
      </div>

      <div className="order-table-footer">
        <span>
          Showing {(activePage - 1) * 12 + (orders.length ? 1 : 0)} to{' '}
          {(activePage - 1) * 12 + orders.length} of {totalCount} orders
        </span>
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
              className={activePage === page ? 'is-active' : ''}
              type="button"
              key={page}
              onClick={() => onPageChange(page)}
              aria-current={activePage === page ? 'page' : undefined}
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
  )
}
