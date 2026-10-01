// Covers administrator verification decision rules.
const assert = require('node:assert/strict');
const test = require('node:test');
const { AccountLifecycleError } = require('./adminAccountLifecycleValue');
const {
  getProfileEdits,
  getStatusUpdates,
  parseDecision,
} = require('./adminVerificationDecision');

test('parses a valid information request', () => {
  assert.deepEqual(parseDecision({
    action: 'needs_information',
    message: 'Upload a license.',
    missingItems: ['license'],
  }), {
    action: 'needs_information',
    message: 'Upload a license.',
    missingItems: ['license'],
    reason: '',
  });
});

test('requires reasons for restrictive verification decisions', () => {
  assert.throws(
    () => parseDecision({ action: 'suspended' }),
    (error) => error instanceof AccountLifecycleError && error.code === 'REASON_REQUIRED',
  );
});

test('only includes editable profile fields', () => {
  assert.deepEqual(getProfileEdits('farmer', {
    profileUpdates: { first_name: ' Ana ', unknown_field: 'ignored' },
  }, {}), { first_name: 'Ana' });
});

test('derives farmer and rider statuses from decisions', () => {
  assert.deepEqual(getStatusUpdates('farmer', 'verified', {}), {
    account_status: 'active',
    verification_status: 'verified',
  });
  assert.deepEqual(getStatusUpdates('rider', 'suspended', {
    availability_status: 'available',
  }), {
    availability_status: 'offline',
    employment_status: 'suspended',
    verification_status: undefined,
  });
});
