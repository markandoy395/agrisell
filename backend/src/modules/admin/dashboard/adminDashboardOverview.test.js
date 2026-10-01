// Covers dashboard overview aggregation rules.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createOverview } = require('./adminDashboardOverview');
const { createIndex } = require('./adminDashboardValue');

test('builds dashboard totals and category breakdowns', () => {
  const data = {
    cartItems: [{ cart_item_id: 1, commodity_id: 20 }],
    categories: [{ category_id: 30, category_name: 'Vegetables' }],
    commodities: [{
      available_quantity: 5,
      category_id: 30,
      commodity_id: 20,
      commodity_status: 'available',
    }],
    deliveries: [{ delivery_status: 'in_transit' }],
    farmers: [{ account_status: 'active', verification_status: 'verified' }],
    orders: [{ cart_item_id: 1 }],
  };
  const paymentRows = [{ amountValue: 250, order: 'Order #AG-1', paidAt: '', status: 'Completed' }];
  const overview = createOverview({
    cartItemsById: createIndex(data.cartItems, 'cart_item_id'),
    commoditiesById: createIndex(data.commodities, 'commodity_id'),
    data,
    orderRows: [{}],
    paymentRows,
  });
  assert.equal(overview.activeFarmers, 1);
  assert.equal(overview.activeListings, 1);
  assert.equal(overview.lowStock, 1);
  assert.equal(overview.totalOrders, 1);
  assert.equal(overview.totalSales, 250);
  assert.deepEqual(overview.commodityMix[0], {
    color: '#71a972',
    name: 'Vegetables',
    orders: 1,
  });
  assert.equal(overview.deliveryStatuses.find(({ label }) => label === 'In transit').value, 1);
});
