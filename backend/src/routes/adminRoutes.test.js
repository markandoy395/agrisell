const assert = require('node:assert/strict');
const test = require('node:test');
const { routeAdminRequest } = require('./adminRoutes');

const createResponse = () => {
  const result = {};
  return {
    end(body) {
      result.body = JSON.parse(body);
    },
    result,
    writeHead(statusCode, headers) {
      result.headers = headers;
      result.statusCode = statusCode;
    },
  };
};

test('returns false for requests outside the admin route tree', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    { admin: { email: 'admin@example.com', permissions: [] }, method: 'GET' },
    response,
    '/api/health',
  );
  assert.equal(handled, false);
  assert.deepEqual(response.result, {});
});

test('blocks protected routes when the permission is missing', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    { admin: { email: 'admin@example.com', permissions: [] }, method: 'GET' },
    response,
    '/api/admin/preferences',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED');
});
