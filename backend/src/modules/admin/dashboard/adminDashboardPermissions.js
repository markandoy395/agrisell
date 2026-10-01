// Filters dashboard payloads according to administrator permissions.
const ENTITY_PERMISSIONS = Object.freeze({
  'Admin Roles': 'admin:manage',
  Admins: 'admin:manage',
  Buyers: 'users:manage',
  'Cart Items': 'orders:manage',
  Carts: 'orders:manage',
  Categories: 'farmers:manage',
  Commodities: 'farmers:manage',
  Deliveries: 'logistics:manage',
  Farmers: 'farmers:manage',
  Farms: 'farmers:manage',
  'Logistics Companies': 'logistics:manage',
  'Order Items': 'orders:manage',
  Orders: 'orders:manage',
  Payments: 'payments:view',
  Reviews: 'reviews:manage',
  Riders: 'logistics:manage',
  'Customer Support': 'support:manage',
  Support: 'support:manage',
  Users: 'users:manage',
});

const emptyOverview = () => ({
  activeFarmers: 0,
  activeListings: 0,
  commodityMix: [],
  deliveryStatuses: [],
  lowStock: 0,
  paymentActivityBars: [],
  salesTrend: [],
  totalOrders: 0,
  totalSales: 0,
});

const filterDashboardByPermissions = (dashboard, permissions) => {
  const permissionSet = new Set(Array.isArray(permissions) ? permissions : []);
  if (permissionSet.has('admin:manage')) return dashboard;

  const entityRows = Object.fromEntries(
    Object.entries(dashboard.entityRows ?? {}).filter(([section]) => {
      const requiredPermission = ENTITY_PERMISSIONS[section];
      return requiredPermission && permissionSet.has(requiredPermission);
    }),
  );

  return {
    ...dashboard,
    administrators: [],
    entityRows,
    farmerFarms: permissionSet.has('farmers:manage') ? dashboard.farmerFarms : [],
    farmers: permissionSet.has('farmers:manage') ? dashboard.farmers : [],
    orders: permissionSet.has('orders:manage') ? dashboard.orders : [],
    overview: permissionSet.has('overview:view') ? dashboard.overview : emptyOverview(),
    payments: permissionSet.has('payments:view') ? dashboard.payments : [],
    users: permissionSet.has('users:manage') ? dashboard.users : [],
  };
};

module.exports = { filterDashboardByPermissions };
