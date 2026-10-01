// Covers dashboard normalization and formatting primitives.
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createIndex,
  getId,
  getName,
  getNumber,
  getText,
  groupRows,
  toAccountStatus,
  toDisplayText,
  toPaymentStatus,
} = require('./adminDashboardValue');

test('normalizes dashboard scalar values', () => {
  assert.equal(getId(42), '42');
  assert.equal(getId(null), '');
  assert.equal(getText('  farmer  '), 'farmer');
  assert.equal(getText('', 'fallback'), 'fallback');
  assert.equal(getNumber('12.5'), 12.5);
  assert.equal(getNumber('invalid', 3), 3);
  assert.equal(toDisplayText('awaiting_pickup'), 'Awaiting Pickup');
});

test('maps account and payment statuses to public dashboard labels', () => {
  assert.equal(toAccountStatus('pending'), 'Pending');
  assert.equal(toAccountStatus('suspended'), 'Suspended');
  assert.equal(toAccountStatus('inactive'), 'Deactivated');
  assert.equal(toAccountStatus('verified'), 'Active');
  assert.equal(toPaymentStatus('settled'), 'Completed');
  assert.equal(toPaymentStatus('refunded'), 'Failed');
  assert.equal(toPaymentStatus('processing'), 'Pending');
});

test('creates names, indexes, and grouped row collections', () => {
  const rows = [
    { farm_id: 1, farmer_id: 10 },
    { farm_id: 2, farmer_id: 10 },
    { farm_id: 3, farmer_id: 11 },
  ];
  assert.equal(getName({ first_name: 'Ana', last_name: 'Cruz' }, 'Farmer'), 'Ana Cruz');
  assert.equal(createIndex(rows, 'farm_id').get('2'), rows[1]);
  assert.deepEqual(groupRows(rows, 'farmer_id').get('10'), rows.slice(0, 2));
});
