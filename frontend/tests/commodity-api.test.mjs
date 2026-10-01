if (!globalThis.Deno) {
  globalThis.Deno = { env: { get: () => '' } }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { handleCommodityRoutes } = await import(
  '../../supabase/functions/admin-api/handlers/commodities.ts'
)
const { routeAdminCommodity } = await import(
  '../../backend/src/routes/adminCommodityRoutes.js'
)

const createAdmin = (permissions = ['farmers:manage']) => ({
  id: 'admin-1',
  email: 'admin@example.test',
  name: 'Commodity Admin',
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

test('commodity routes require farmers:manage or admin:manage permission', async () => {
  const getRequest = new Request('http://localhost/api/admin/commodities', {
    method: 'GET',
  })
  await assert.rejects(
    () => handleCommodityRoutes(getRequest, '/api/admin/commodities', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )

  const statusRequest = new Request('http://localhost/api/admin/commodities/1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'hidden' }),
  })
  await assert.rejects(
    () => handleCommodityRoutes(statusRequest, '/api/admin/commodities/1/status', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )

  const detailRequest = new Request('http://localhost/api/admin/commodities/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'Updated description' }),
  })
  await assert.rejects(
    () => handleCommodityRoutes(detailRequest, '/api/admin/commodities/1', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )
})

test('node backend commodity routes reject unauthorized requests', async () => {
  const mockReq = {
    admin: createAdmin([]),
    headers: {},
    method: 'GET',
    url: '/api/admin/commodities',
  }
  const mockRes = createMockResponse()
  const handled = await routeAdminCommodity(mockReq, mockRes, '/api/admin/commodities')
  assert.equal(handled, true)
  assert.equal(mockRes.result.statusCode, 403)
})

test('status update rejects invalid status strings', async () => {
  const invalidStatusRequest = new Request('http://localhost/api/admin/commodities/1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'invalid_status' }),
  })

  await assert.rejects(
    () =>
      handleCommodityRoutes(
        invalidStatusRequest,
        '/api/admin/commodities/1/status',
        createAdmin(['farmers:manage']),
      ),
    (error) => error.status === 400 && error.code === 'INVALID_COMMODITY_STATUS',
  )
})

test('detail update rejects non-object payloads', async () => {
  const invalidPayloadRequest = new Request('http://localhost/api/admin/commodities/1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: 'null',
  })

  await assert.rejects(
    () =>
      handleCommodityRoutes(
        invalidPayloadRequest,
        '/api/admin/commodities/1',
        createAdmin(['farmers:manage']),
      ),
    (error) => error.status === 400 && error.code === 'INVALID_PAYLOAD',
  )
})

test('super admin (admin:manage) is permitted on all commodity routes', async () => {
  const invalidStatusRequest = new Request('http://localhost/api/admin/commodities/1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'invalid_status' }),
  })

  // Should get past the permission check and fail on status validation (400, not 403)
  await assert.rejects(
    () =>
      handleCommodityRoutes(
        invalidStatusRequest,
        '/api/admin/commodities/1/status',
        createAdmin(['admin:manage']),
      ),
    (error) => error.status === 400 && error.code === 'INVALID_COMMODITY_STATUS',
  )
})

test('commodity creation requires farmers:manage or admin:manage permission', async () => {
  const createReq = new Request('http://localhost/api/admin/commodities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmId: '1',
      name: 'Organic Highland Carrots',
      price: 120,
      unitType: 'kg',
      availableQuantity: 50,
      minimumOrderQuantity: 5,
      lotCode: 'LOT-2026-001',
      dateType: 'fresh_produce',
      harvestedAt: '2026-09-20',
      sellUntil: '2026-09-27',
      storageInstructions: 'Store chilled at 4°C',
    }),
  })
  await assert.rejects(
    () => handleCommodityRoutes(createReq, '/api/admin/commodities', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )

  const mockReq = {
    admin: createAdmin([]),
    headers: {},
    method: 'POST',
    url: '/api/admin/commodities',
  }
  const mockRes = createMockResponse()
  const handled = await routeAdminCommodity(mockReq, mockRes, '/api/admin/commodities')
  assert.equal(handled, true)
  assert.equal(mockRes.result.statusCode, 403)
})

test('commodity creation validates payload fields', async () => {
  const invalidReq = new Request('http://localhost/api/admin/commodities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Missing Farm ID',
      price: 100,
    }),
  })

  await assert.rejects(
    () => handleCommodityRoutes(invalidReq, '/api/admin/commodities', createAdmin(['farmers:manage'])),
    (error) => error.status === 400 && error.code === 'INVALID_PAYLOAD',
  )

  const invalidPriceReq = new Request('http://localhost/api/admin/commodities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmId: '1',
      name: 'Negative Price Commodity',
      price: -10,
    }),
  })

  await assert.rejects(
    () => handleCommodityRoutes(invalidPriceReq, '/api/admin/commodities', createAdmin(['farmers:manage'])),
    (error) => error.status === 400 && error.code === 'INVALID_PAYLOAD',
  )
})

