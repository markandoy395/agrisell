if (!globalThis.Deno) {
  globalThis.Deno = { env: { get: () => '' } }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { handleCategoryRoutes } = await import(
  '../../supabase/functions/admin-api/handlers/categories.ts'
)
const { routeAdminCategory } = await import(
  '../../backend/src/routes/adminCategoryRoutes.js'
)

const createAdmin = (permissions = ['farmers:manage']) => ({
  id: 'admin-1',
  email: 'admin@example.test',
  name: 'Category Admin',
  permissions,
})

const createMockResponse = () => {
  const result = { headers: {}, statusCode: 200 }
  return {
    writeHead(status, headers) {
      result.statusCode = status
      result.headers = headers
    },
    end(body) {
      result.body = body ? JSON.parse(body) : undefined
    },
    result,
  }
}

test('category routes require farmers:manage or admin:manage permission', async () => {
  const getRequest = new Request('http://localhost/api/admin/categories', {
    method: 'GET',
  })
  await assert.rejects(
    () => handleCategoryRoutes(getRequest, '/api/admin/categories', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )

  const postRequest = new Request('http://localhost/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryName: 'Vegetables' }),
  })
  await assert.rejects(
    () => handleCategoryRoutes(postRequest, '/api/admin/categories', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )

  const statusRequest = new Request('http://localhost/api/admin/categories/1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'delisted' }),
  })
  await assert.rejects(
    () => handleCategoryRoutes(statusRequest, '/api/admin/categories/1/status', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )

  const reorderRequest = new Request('http://localhost/api/admin/categories/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: ['1', '2'] }),
  })
  await assert.rejects(
    () => handleCategoryRoutes(reorderRequest, '/api/admin/categories/reorder', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )
})

test('node category routes enforce permissions and return 403 when missing', async () => {
  const mockRes = createMockResponse()
  const handled = await routeAdminCategory(
    { admin: createAdmin([]), method: 'GET' },
    mockRes,
    '/api/admin/categories',
  )
  assert.equal(handled, true)
  assert.equal(mockRes.result.statusCode, 403)
  assert.equal(mockRes.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED')
})

test('node category routes return false for unmatched paths', async () => {
  const mockRes = createMockResponse()
  const handled = await routeAdminCategory(
    { admin: createAdmin(['farmers:manage']), method: 'GET' },
    mockRes,
    '/api/admin/other',
  )
  assert.equal(handled, false)
})
