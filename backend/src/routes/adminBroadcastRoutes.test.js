const assert = require('node:assert/strict');
const test = require('node:test');
const { routeAdminBroadcast } = require('./adminBroadcastRoutes');

const createResponse = () => {
  const result = {};
  return {
    end(body) {
      result.body = body ? JSON.parse(body) : null;
    },
    result,
    writeHead(statusCode, headers) {
      result.headers = headers;
      result.statusCode = statusCode;
    },
  };
};

test('blocks broadcast post without users:manage, support:manage, or admin:manage', async () => {
  const response = createResponse();
  const handled = await routeAdminBroadcast(
    { admin: { email: 'admin@example.com', permissions: ['orders:manage'] }, method: 'POST' },
    response,
    '/api/admin/broadcasts',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED');
});

test('returns false for non-broadcast paths', async () => {
  const response = createResponse();
  const handled = await routeAdminBroadcast(
    { admin: { email: 'admin@example.com', permissions: ['admin:manage'] }, method: 'GET' },
    response,
    '/api/admin/unknown',
  );
  assert.equal(handled, false);
});
