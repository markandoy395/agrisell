import { getDashboard } from "./dashboard.ts";

const ENTITY_PERMISSIONS: Record<string, string> = {
  "Admin Roles": "admin:manage", Admins: "admin:manage", Buyers: "users:manage",
  "Cart Items": "orders:manage", Carts: "orders:manage", Categories: "farmers:manage",
  Commodities: "farmers:manage", Deliveries: "logistics:manage", Farmers: "farmers:manage",
  Farms: "farmers:manage", "Logistics Companies": "logistics:manage",
  "Order Items": "orders:manage", Orders: "orders:manage", Payments: "payments:view",
  Reviews: "reviews:manage", Riders: "logistics:manage", Users: "users:manage",
};

const emptyOverview = () => ({
  activeFarmers: 0, activeListings: 0, commodityMix: [], deliveryStatuses: [],
  lowStock: 0, paymentActivityBars: [], salesTrend: [], totalOrders: 0, totalSales: 0,
});

export const filterDashboardByPermissions = (
  dashboard: Awaited<ReturnType<typeof getDashboard>>,
  permissions: string[],
) => {
  const allowed = new Set(permissions);
  if (allowed.has("admin:manage")) return dashboard;
  return {
    ...dashboard,
    administrators: [],
    entityRows: Object.fromEntries(Object.entries(dashboard.entityRows)
      .filter(([section]) => {
        const required = ENTITY_PERMISSIONS[section];
        return required && allowed.has(required);
      })),
    farmerFarms: allowed.has("farmers:manage") ? dashboard.farmerFarms : [],
    farmers: allowed.has("farmers:manage") ? dashboard.farmers : [],
    orders: allowed.has("orders:manage") ? dashboard.orders : [],
    overview: allowed.has("overview:view") ? dashboard.overview : emptyOverview(),
    payments: allowed.has("payments:view") ? dashboard.payments : [],
    users: allowed.has("users:manage") ? dashboard.users : [],
  };
};
