import type { OrderCsvRow } from "./orderCsv";
import type {
  OrderAvatarTone,
  OrderDeliveryStatus,
  OrderFilter,
  OrderRow,
  OrderServiceType,
  OrderSortDirection,
  OrderStatusGroup,
  OrderWorkspaceRow,
} from "../types/dashboard";

type CreateOrderWorkspaceRowsParams = {
  orders: OrderRow[];
  avatarTones: OrderAvatarTone[];
  couriers: string[];
  destinations: string[];
  arrivals: string[];
  dates: string[];
};

type OrderFilterParams = {
  activeFilter: OrderFilter;
  query: string;
  sortDirection: OrderSortDirection;
};

const successfulOrderStatuses = new Set([
  "delivered",
  "paid",
  "completed",
  "complete",
  "success",
]);

const failedOrderStatuses = new Set([
  "failed",
  "cancelled",
  "canceled",
  "refunded",
]);

export function getOrderStatusGroup(status: string): OrderStatusGroup {
  const normalizedStatus = status.trim().toLowerCase();

  if (successfulOrderStatuses.has(normalizedStatus)) return "Success";
  if (failedOrderStatuses.has(normalizedStatus)) return "Failed";

  return "Pending";
}

export function getDeliveryStatus(
  statusGroup: OrderStatusGroup,
): OrderDeliveryStatus {
  if (statusGroup === "Success") return "Completed";
  if (statusGroup === "Failed") return "Failed";

  return "Delivering";
}

export function getOrderInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OR"
  );
}

export function getOrderTrackingNumber(orderId: string) {
  const digits = orderId.replace(/\D/g, "").padStart(8, "0").slice(-8);

  return `ID9234${digits}`;
}

export function createOrderWorkspaceRows({
  orders,
  avatarTones,
  couriers,
  destinations,
  arrivals,
  dates,
}: CreateOrderWorkspaceRowsParams): OrderWorkspaceRow[] {
  return orders.map((order, index) => {
    const serviceType: OrderServiceType =
      index % 5 === 4 ? "Regular" : "Express";

    return {
      order,
      avatarTone: avatarTones[index % avatarTones.length] ?? "green",
      courier: couriers[index % couriers.length] ?? "Unassigned courier",
      courierTone: avatarTones[(index + 2) % avatarTones.length] ?? "green",
      destination: destinations[index % destinations.length] ?? "No address",
      estimatedArrival: arrivals[index % arrivals.length] ?? "Not scheduled",
      orderDate: dates[index % dates.length] ?? "Not scheduled",
      serviceType,
      sortIndex: index,
      statusGroup: getOrderStatusGroup(order.status),
      trackingNumber: getOrderTrackingNumber(order.id),
    };
  });
}

export function getOrderStatusCounts(rows: OrderWorkspaceRow[]) {
  return rows.reduce<Record<OrderFilter, number>>(
    (counts, row) => {
      counts.All += 1;
      counts[row.statusGroup] += 1;

      return counts;
    },
    { All: 0, Success: 0, Pending: 0, Failed: 0 },
  );
}

export function getFilteredOrderRows(
  rows: OrderWorkspaceRow[],
  { activeFilter, query, sortDirection }: OrderFilterParams,
) {
  const normalizedQuery = query.toLowerCase().trim();

  return rows
    .filter((row) => {
      const matchesStatus =
        activeFilter === "All" || row.statusGroup === activeFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${row.trackingNumber} ${row.order.customer} ${row.destination} ${row.courier} ${row.serviceType}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    })
    .sort((currentRow, nextRow) =>
      sortDirection === "desc"
        ? currentRow.sortIndex - nextRow.sortIndex
        : nextRow.sortIndex - currentRow.sortIndex,
    );
}

export function getOrderCsvRows(rows: OrderWorkspaceRow[]): OrderCsvRow[] {
  return rows.map((row) => ({
    trackingNumber: row.trackingNumber,
    recipientName: row.order.customer,
    orderDate: row.orderDate,
    destination: row.destination,
    serviceType: row.serviceType,
    courier: row.courier,
    estimatedArrival: row.estimatedArrival,
    status: getDeliveryStatus(row.statusGroup),
  }));
}
