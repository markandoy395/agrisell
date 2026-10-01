// Covers permission filtering for dashboard datasets.
const assert = require('node:assert/strict');
const test = require('node:test');
const { filterDashboardByPermissions } = require('./adminDashboardPermissions');

const populatedDashboard = () => ({
  administrators: ['administrator'],
  entityRows: {
    'Admin Roles': ['role'],
    Admins: ['administrator'],
    Buyers: ['buyer'],
    'Cart Items': ['cart item'],
    Carts: ['cart'],
    Categories: ['category'],
    Commodities: ['commodity'],
    Deliveries: ['delivery'],
    Farmers: ['farmer'],
    Farms: ['farm'],
    'Logistics Companies': ['company'],
    'Order Items': ['order item'],
    Orders: ['order'],
    Payments: ['payment'],
    Reviews: ['review'],
    Riders: ['rider'],
    Unknown: ['must fail closed'],
    Users: ['user'],
  },
  farmerFarms: ['farm'],
  farmers: ['farmer'],
  orders: ['order'],
  overview: {
    activeFarmers: 1,
    activeListings: 2,
    commodityMix: ['mix'],
    deliveryStatuses: ['delivery'],
    lowStock: 3,
    paymentActivityBars: [4],
    salesTrend: ['sale'],
    totalOrders: 5,
    totalSales: 6,
  },
  payments: ['payment'],
  users: ['user'],
});

test('filters every dashboard dataset by its server-side permission', () => {
  const filtered = filterDashboardByPermissions(populatedDashboard(), [
    'users:manage',
    'reviews:manage',
  ]);

  assert.deepEqual(filtered.administrators, []);
  assert.deepEqual(filtered.users, ['user']);
  assert.deepEqual(filtered.farmers, []);
  assert.deepEqual(filtered.farmerFarms, []);
  assert.deepEqual(filtered.orders, []);
  assert.deepEqual(filtered.payments, []);
  assert.deepEqual(filtered.entityRows, {
    Buyers: ['buyer'],
    Reviews: ['review'],
    Users: ['user'],
  });
  assert.deepEqual(filtered.overview, {
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
});

test('overview permission exposes aggregates without exposing detailed datasets', () => {
  const dashboard = populatedDashboard();
  const filtered = filterDashboardByPermissions(dashboard, ['overview:view']);

  assert.equal(filtered.overview, dashboard.overview);
  assert.deepEqual(filtered.entityRows, {});
  assert.deepEqual(filtered.users, []);
  assert.deepEqual(filtered.farmers, []);
  assert.deepEqual(filtered.orders, []);
  assert.deepEqual(filtered.payments, []);
});

test('admin management permission retains the complete dashboard', () => {
  const dashboard = populatedDashboard();

  assert.equal(filterDashboardByPermissions(dashboard, ['admin:manage']), dashboard);
});

test('maps every detailed entity section to its owning module', () => {
  const cases = [
    ['users:manage', ['Buyers', 'Users']],
    ['farmers:manage', ['Categories', 'Commodities', 'Farmers', 'Farms']],
    ['orders:manage', ['Cart Items', 'Carts', 'Order Items', 'Orders']],
    ['payments:view', ['Payments']],
    ['reviews:manage', ['Reviews']],
    ['logistics:manage', ['Deliveries', 'Logistics Companies', 'Riders']],
  ];

  cases.forEach(([permission, expectedSections]) => {
    const filtered = filterDashboardByPermissions(populatedDashboard(), [permission]);
    assert.deepEqual(Object.keys(filtered.entityRows).sort(), expectedSections.sort());
  });
});

test('fails closed when permissions are absent', () => {
  const filtered = filterDashboardByPermissions(populatedDashboard());

  assert.deepEqual(filtered.entityRows, {});
  assert.deepEqual(filtered.administrators, []);
  assert.deepEqual(filtered.users, []);
  assert.deepEqual(filtered.farmers, []);
  assert.deepEqual(filtered.orders, []);
  assert.deepEqual(filtered.payments, []);
});
