const assert = require('node:assert/strict');
const test = require('node:test');

const { createOrderRows } = require('./adminDashboardPrimaryRows');

const emptyIndexes = {
  buyersById: new Map(),
  cartItemsById: new Map(),
  cartsById: new Map(),
  commoditiesById: new Map(),
  usersById: new Map(),
};

test('orders display overdue when their latest active delivery is past its estimate', () => {
  const rows = createOrderRows({
    ...emptyIndexes,
    deliveries: [{
      delivery_id: 1,
      delivery_status: 'available',
      estimated_delivery_time: '2000-01-01T00:00:00Z',
      order_id: 10,
    }],
    orders: [{ order_id: 10, order_status: 'readyForPickup' }],
  });

  assert.equal(rows[0].status, 'Overdue');
  assert.equal(rows[0].tone, 'red');
});

test('closed and superseded deliveries do not make an order overdue', () => {
  const rows = createOrderRows({
    ...emptyIndexes,
    deliveries: [
      {
        delivery_id: 1,
        delivery_status: 'available',
        estimated_delivery_time: '2000-01-01T00:00:00Z',
        order_id: 10,
      },
      {
        delivery_id: 2,
        delivery_status: 'completed',
        estimated_delivery_time: '2000-01-01T00:00:00Z',
        order_id: 10,
      },
    ],
    orders: [{ order_id: 10, order_status: 'delivered' }],
  });

  assert.equal(rows[0].status, 'Delivered');
});
