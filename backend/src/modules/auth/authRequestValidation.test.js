const assert = require('node:assert/strict');
const test = require('node:test');
const { isObjectBody } = require('./authRequestValidation');

test('accepts JSON object bodies only', () => {
  assert.equal(isObjectBody({ email: 'admin@example.com' }), true);
  assert.equal(isObjectBody([]), false);
  assert.equal(isObjectBody(null), false);
  assert.equal(isObjectBody('email=admin@example.com'), false);
});
