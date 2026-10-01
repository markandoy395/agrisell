import { useMemo, useState } from 'react'
import { OrderControls } from '../../components/ui/orderWorkspace/OrderControls'
import { OrderSummaryGrid } from '../../components/ui/orderWorkspace/OrderSummaryGrid'
import { OrderTable } from '../../components/ui/orderWorkspace/OrderTable'
import { useOrderWorkspace } from '../../hooks/useOrderWorkspace'
import { getOrderStatusGroup } from '../../utils/orderWorkspace'
import type { OrderRow, OrderSummaryCard, UserWorkspaceRow } from '../../types/dashboard'
import './OrderWorkspace.css'
import { OrderManagementPanel } from './OrderManagementPanel'
import { CreateManualOrderModal } from './CreateManualOrderModal'

type OrderWorkspaceProps = {
  orders: OrderRow[]
  onOrdersChanged: () => Promise<void>
  onManageDelivery: (deliveryId: number) => void
  users?: UserWorkspaceRow[]
}

const createSummaryCards = (orders: OrderRow[]): OrderSummaryCard[] => {
  const statusCounts = orders.reduce(
    (counts, order) => {
      const status = getOrderStatusGroup(order.status)
      counts[status] += 1
      return counts
    },
    { Failed: 0, Pending: 0, Success: 0 },
  )

  return [
    {
      detail: 'All database orders',
      icon: 'cart',
      label: 'Total orders',
      tone: 'green',
      trend: 'Live',
      trendTone: 'green',
      value: orders.length.toLocaleString('en-US'),
    },
    {
      detail: 'Awaiting fulfilment or payment',
      icon: 'truck',
      label: 'In process',
      tone: 'blue',
      trend: 'Live',
      trendTone: 'green',
      value: statusCounts.Pending.toLocaleString('en-US'),
    },
    {
      detail: 'Cancelled, refunded, or failed',
      icon: 'close',
      label: 'Cancelled',
      tone: 'red',
      trend: 'Live',
      trendTone: 'red',
      value: statusCounts.Failed.toLocaleString('en-US'),
    },
    {
      detail: 'Paid, completed, or delivered',
      icon: 'check',
      label: 'Completed',
      tone: 'orange',
      trend: 'Live',
      trendTone: 'green',
      value: statusCounts.Success.toLocaleString('en-US'),
    },
  ]
}

export function OrderWorkspace({ orders, onOrdersChanged, onManageDelivery, users = [] }: OrderWorkspaceProps) {
  const workspace = useOrderWorkspace({ orders })
  const [managedOrder, setManagedOrder] = useState<OrderRow | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const summaryCards = useMemo(() => createSummaryCards(orders), [orders])

  const handleOrderCreated = async (orderId: number) => {
    await onOrdersChanged()
    const newOrder = orders.find((o) => o.id === `AG-${orderId}` || o.id === String(orderId))
    if (newOrder) {
      setManagedOrder(newOrder)
    } else {
      setManagedOrder({
        id: `AG-${orderId}`,
        customer: 'Manual Order',
        initial: 'MO',
        item: 'Commodity',
        qty: '1 unit',
        status: 'To Ship',
        time: 'Just now',
        tone: 'blue',
        total: 'PHP 0.00',
      })
    }
  }

  return (
    <section className="order-workspace" aria-label="Order management">
      <OrderSummaryGrid cards={summaryCards} />
      <OrderControls
        activeFilter={workspace.activeFilter}
        filters={workspace.filters}
        hasActiveOrderFilters={workspace.hasActiveOrderFilters}
        hasDownloadableOrders={workspace.hasDownloadableOrders}
        orderQuery={workspace.orderQuery}
        sortDirection={workspace.sortDirection}
        statusCounts={workspace.statusCounts}
        onClearFilters={workspace.clearOrderFilters}
        onCreateOrder={() => setIsCreateModalOpen(true)}
        onDownload={workspace.downloadFilteredOrders}
        onFilterChange={workspace.updateOrderFilter}
        onQueryChange={workspace.updateOrderQuery}
        onToggleSortDirection={workspace.toggleSortDirection}
      />
      <OrderTable
        activePage={workspace.activePage}
        allVisibleSelected={workspace.allVisibleOrdersSelected}
        orders={workspace.pageRows}
        pageNumbers={workspace.pageNumbers}
        partiallyVisibleSelected={workspace.partiallyVisibleOrdersSelected}
        selectedOrderIds={workspace.selectedOrderIds}
        totalCount={workspace.filteredOrderCount}
        totalPages={workspace.totalPages}
        onOpenOrder={setManagedOrder}
        onPageChange={workspace.setCurrentPage}
        onToggleAllVisible={workspace.toggleAllVisibleOrders}
        onToggleOrderSelection={workspace.toggleOrderSelection}
      />
      {managedOrder && (
        <OrderManagementPanel
          key={managedOrder.id}
          order={managedOrder}
          onClose={() => setManagedOrder(null)}
          onSaved={onOrdersChanged}
          onManageDelivery={onManageDelivery}
        />
      )}
      <CreateManualOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onOrderCreated={handleOrderCreated}
        users={users}
      />
    </section>
  )
}
