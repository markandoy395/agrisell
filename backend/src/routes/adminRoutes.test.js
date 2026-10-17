const assert = require('node:assert/strict');
const test = require('node:test');
const { routeAdminRequest } = require('./adminRoutes');

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

test('returns false for requests outside the admin route tree', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    { admin: { email: 'admin@example.com', permissions: [], role: 'admin' }, method: 'GET' },
    response,
    '/api/health',
  );
  assert.equal(handled, false);
  assert.deepEqual(response.result, {});
});

test('rejects unauthenticated requests to admin routes with 401 AUTHENTICATION_REQUIRED', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    { method: 'GET' },
    response,
    '/api/admin/dashboard',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 401);
  assert.equal(response.result.body.code, 'AUTHENTICATION_REQUIRED');
});

test('rejects requests from authenticated users with role "user" with 403 ADMIN_ROLE_REQUIRED', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    {
      admin: { email: 'buyer@example.com', permissions: [], role: 'user' },
      method: 'GET',
    },
    response,
    '/api/admin/dashboard',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'ADMIN_ROLE_REQUIRED');
  assert.equal(
    response.result.body.message,
    'Access denied. Administrator role is required for this action.',
  );
});

test('rejects requests from authenticated users with role "farmer" with 403 ADMIN_ROLE_REQUIRED', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    {
      admin: { email: 'farmer@example.com', permissions: ['farmers:manage'], role: 'farmer' },
      method: 'GET',
    },
    response,
    '/api/admin/categories',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'ADMIN_ROLE_REQUIRED');
});

test('rejects requests from authenticated users with role "rider" with 403 ADMIN_ROLE_REQUIRED', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    {
      admin: { email: 'rider@example.com', permissions: ['logistics:manage'], role: 'rider' },
      method: 'GET',
    },
    response,
    '/api/admin/deliveries/options',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'ADMIN_ROLE_REQUIRED');
});

test('blocks protected routes when the permission is missing', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    { admin: { email: 'admin@example.com', permissions: [], role: 'admin' }, method: 'GET' },
    response,
    '/api/admin/preferences',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED');
});

test('blocks super admin actions when admin:manage is missing', async () => {
  const response = createResponse();
  const handled = await routeAdminRequest(
    {
      admin: { email: 'admin@example.com', permissions: ['overview:view'], role: 'admin' },
      method: 'POST',
    },
    response,
    '/api/admin/administrators',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'SUPER_ADMIN_REQUIRED');
});
