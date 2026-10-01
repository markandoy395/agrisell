const assert = require('node:assert/strict');
const test = require('node:test');
const { routeAdminCategory } = require('./adminCategoryRoutes');

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

test('blocks category route without farmers:manage permission', async () => {
  const response = createResponse();
  const handled = await routeAdminCategory(
    { admin: { email: 'admin@example.com', permissions: ['orders:manage'] }, method: 'GET' },
    response,
    '/api/admin/categories',
  );
  assert.equal(handled, true);
  assert.equal(response.result.statusCode, 403);
  assert.equal(response.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED');
});

test('returns false for non-category paths', async () => {
  const response = createResponse();
  const handled = await routeAdminCategory(
    { admin: { email: 'admin@example.com', permissions: ['farmers:manage'] }, method: 'GET' },
    response,
    '/api/admin/unknown',
  );
  assert.equal(handled, false);
});
