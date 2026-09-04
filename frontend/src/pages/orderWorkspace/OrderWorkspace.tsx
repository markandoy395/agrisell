import { useMemo } from "react";
import { OrderControls } from "../../components/ui/orderWorkspace/OrderControls";
import { OrderSummaryGrid } from "../../components/ui/orderWorkspace/OrderSummaryGrid";
import { OrderTable } from "../../components/ui/orderWorkspace/OrderTable";
import { useOrderWorkspace } from "../../hooks/useOrderWorkspace";
import { getOrderStatusGroup } from "../../utils/orderWorkspace";
import type { OrderRow, OrderSummaryCard } from "../../types/dashboard";
import { Icon } from "../../components/ui/icon/Icon";
import "./OrderWorkspace.css";

type OrderWorkspaceProps = {
  orders: OrderRow[];
  onOpenOrder: (order: OrderRow) => void;
};

const createSummaryCards = (orders: OrderRow[]): OrderSummaryCard[] => {
  const statusCounts = orders.reduce(
    (counts, order) => {
      const status = getOrderStatusGroup(order.status);
      counts[status] += 1;
      return counts;
    },
    { Failed: 0, Pending: 0, Success: 0 },
  );

  return [
    {
      detail: "All database orders",
      icon: "cart",
      label: "Total orders",
      tone: "green",
      trend: "Live",
      trendTone: "green",
      value: orders.length.toLocaleString("en-US"),
    },
    {
      detail: "Awaiting fulfilment or payment",
      icon: "truck",
      label: "In process",
      tone: "blue",
      trend: "Live",
      trendTone: "green",
      value: statusCounts.Pending.toLocaleString("en-US"),
    },
    {
      detail: "Cancelled, refunded, or failed",
      icon: "close",
      label: "Cancelled",
      tone: "red",
      trend: "Live",
      trendTone: "red",
      value: statusCounts.Failed.toLocaleString("en-US"),
    },
    {
      detail: "Paid, completed, or delivered",
      icon: "check",
      label: "Completed",
      tone: "orange",
      trend: "Live",
      trendTone: "green",
      value: statusCounts.Success.toLocaleString("en-US"),
    },
  ];
};

export function OrderWorkspace({ orders, onOpenOrder }: OrderWorkspaceProps) {
  const workspace = useOrderWorkspace({ orders });
  const summaryCards = useMemo(() => createSummaryCards(orders), [orders]);

  return (
    <section className="order-workspace" aria-labelledby="order-title">
      <header className="order-workspace-header">
        <div className="order-heading-main">
          <span className="order-heading-icon" aria-hidden="true"><Icon name="cart" size={25} /></span>
          <div>
            <h1 id="order-title">Order</h1>
            <p>Monitor and manage all customer orders in one place.</p>
          </div>
        </div>
        <div className="order-header-actions">
          <button className="order-sort-button" type="button" onClick={workspace.toggleSortDirection} aria-label={`Sort orders ${workspace.sortDirection === "desc" ? "oldest first" : "newest first"}`}>
            <Icon name="calendar" size={15} />
            {workspace.sortDirection === "desc" ? "Newest first" : "Oldest first"}
            <Icon name="chevron" size={14} />
          </button>
          <button className="order-download-button" type="button" disabled={!workspace.hasDownloadableOrders} onClick={workspace.downloadFilteredOrders}>
            Download <Icon name="download" size={15} />
          </button>
        </div>
      </header>

      <OrderSummaryGrid cards={summaryCards} />
      <OrderControls
        activeFilter={workspace.activeFilter}
        filters={workspace.filters}
        hasActiveOrderFilters={workspace.hasActiveOrderFilters}
        orderQuery={workspace.orderQuery}
        statusCounts={workspace.statusCounts}
        onClearFilters={workspace.clearOrderFilters}
        onFilterChange={workspace.updateOrderFilter}
        onQueryChange={workspace.updateOrderQuery}
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
        onOpenOrder={onOpenOrder}
        onPageChange={workspace.setCurrentPage}
        onToggleAllVisible={workspace.toggleAllVisibleOrders}
        onToggleOrderSelection={workspace.toggleOrderSelection}
      />
    </section>
  );
}
