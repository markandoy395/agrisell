import { useMemo, useState } from "react";
import {
  orderArrivals,
  orderAvatarTones,
  orderCouriers,
  orderDates,
  orderDestinations,
  orderFilters,
  orderPageSize,
} from "../data/orderWorkspaceMock";
import type {
  OrderFilter,
  OrderRow,
  OrderSortDirection,
} from "../types/dashboard";
import { downloadOrdersCsv } from "../utils/orderCsv";
import {
  createOrderWorkspaceRows,
  getFilteredOrderRows,
  getOrderCsvRows,
  getOrderStatusCounts,
} from "../utils/orderWorkspace";

type UseOrderWorkspaceParams = {
  orders: OrderRow[];
};

export function useOrderWorkspace({ orders }: UseOrderWorkspaceParams) {
  const [activeFilter, setActiveFilter] = useState<OrderFilter>("All");
  const [orderQuery, setOrderQuery] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sortDirection, setSortDirection] =
    useState<OrderSortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const displayRows = useMemo(
    () =>
      createOrderWorkspaceRows({
        orders,
        avatarTones: orderAvatarTones,
        couriers: orderCouriers,
        destinations: orderDestinations,
        arrivals: orderArrivals,
        dates: orderDates,
      }),
    [orders],
  );

  const statusCounts = useMemo(
    () => getOrderStatusCounts(displayRows),
    [displayRows],
  );

  const filteredRows = useMemo(
    () =>
      getFilteredOrderRows(displayRows, {
        activeFilter,
        query: orderQuery,
        sortDirection,
      }),
    [activeFilter, displayRows, orderQuery, sortDirection],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / orderPageSize),
  );
  const activePage = Math.min(currentPage, totalPages);
  const pageRows = filteredRows.slice(
    (activePage - 1) * orderPageSize,
    activePage * orderPageSize,
  );
  const visibleOrderIds = pageRows.map((row) => row.order.id);
  const selectedVisibleOrderCount = visibleOrderIds.filter((orderId) =>
    selectedOrderIds.has(orderId),
  ).length;
  const allVisibleOrdersSelected =
    visibleOrderIds.length > 0 &&
    selectedVisibleOrderCount === visibleOrderIds.length;
  const partiallyVisibleOrdersSelected =
    selectedVisibleOrderCount > 0 && !allVisibleOrdersSelected;

  const resetOrderPage = () => setCurrentPage(1);

  const updateOrderFilter = (filter: OrderFilter) => {
    setActiveFilter(filter);
    resetOrderPage();
  };

  const updateOrderQuery = (query: string) => {
    setOrderQuery(query);
    resetOrderPage();
  };

  const clearOrderFilters = () => {
    setActiveFilter("All");
    setOrderQuery("");
    resetOrderPage();
  };

  const toggleAllVisibleOrders = () => {
    setSelectedOrderIds((current) => {
      const nextSelectedOrderIds = new Set(current);

      visibleOrderIds.forEach((orderId) => {
        if (allVisibleOrdersSelected) {
          nextSelectedOrderIds.delete(orderId);
        } else {
          nextSelectedOrderIds.add(orderId);
        }
      });

      return nextSelectedOrderIds;
    });
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) => {
      const nextSelectedOrderIds = new Set(current);

      if (nextSelectedOrderIds.has(orderId)) {
        nextSelectedOrderIds.delete(orderId);
      } else {
        nextSelectedOrderIds.add(orderId);
      }

      return nextSelectedOrderIds;
    });
  };

  const toggleSortDirection = () => {
    setSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
  };

  const downloadFilteredOrders = () => {
    if (filteredRows.length === 0) return;

    downloadOrdersCsv(getOrderCsvRows(filteredRows));
  };

  return {
    activeFilter,
    activePage,
    allVisibleOrdersSelected,
    clearOrderFilters,
    downloadFilteredOrders,
    filters: orderFilters,
    hasActiveOrderFilters:
      activeFilter !== "All" || orderQuery.trim().length > 0,
    hasDownloadableOrders: filteredRows.length > 0,
    orderQuery,
    pageNumbers: Array.from({ length: totalPages }, (_, index) => index + 1),
    pageRows,
    partiallyVisibleOrdersSelected,
    selectedOrderIds,
    setCurrentPage,
    sortDirection,
    statusCounts,
    toggleAllVisibleOrders,
    toggleOrderSelection,
    toggleSortDirection,
    totalPages,
    updateOrderFilter,
    updateOrderQuery,
  };
}
