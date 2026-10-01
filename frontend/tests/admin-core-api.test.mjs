import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.Deno = { env: { get: () => undefined } }

const { handleAdminWorkspaceRoutes } =
  await import('../../supabase/functions/admin-api/handlers/adminWorkspace.ts')
const { requirePermission } =
  await import('../../supabase/functions/admin-api/handlers/permission.ts')
const { handleSaleRoutes } = await import('../../supabase/functions/admin-api/handlers/sales.ts')
const { handleUserRoutes } = await import('../../supabase/functions/admin-api/handlers/users.ts')
const { handleVerificationRoutes } =
  await import('../../supabase/functions/admin-api/handlers/verifications.ts')

const admin = (permissions = []) => ({
  email: 'admin@example.invalid',
  name: 'Test Admin',
  permissions,
  role: 'admin',
  userId: '1',
})

const request = (method, body) =>
  new Request('https://example.invalid', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })

const isForbidden = (error) => error?.status === 403 && error?.code === 'ADMIN_PRIVILEGE_REQUIRED'

test('module permission checks fail closed and admin management overrides module grants', () => {
  for (const permission of [
    'users:manage',
    'farmers:manage',
    'logistics:manage',
    'sales:manage',
    'payments:view',
    'payments:manage',
    'settings:manage',
  ]) {
    assert.throws(() => requirePermission([], permission), isForbidden)
    assert.doesNotThrow(() => requirePermission([permission], permission))
    assert.doesNotThrow(() => requirePermission(['admin:manage'], permission))
  }
})

test('user creation rejects unauthorized requests before parsing or database access', async () => {
  await assert.rejects(handleUserRoutes(request('POST'), '/api/admin/users', admin()), isForbidden)
  await assert.rejects(
    handleUserRoutes(request('POST', {}), '/api/admin/users', admin(['users:manage'])),
    (error) => error?.status === 400 && error?.code === 'INVALID_USER_PAYLOAD',
  )
})

test('farmer and rider approvals enforce their distinct permissions', async () => {
  await assert.rejects(
    handleVerificationRoutes(
      request('PATCH'),
      '/api/admin/farmers/42/approval',
      admin(['logistics:manage']),
    ),
    isForbidden,
  )
  await assert.rejects(
    handleVerificationRoutes(
      request('PATCH'),
      '/api/admin/riders/42/approval',
      admin(['farmers:manage']),
    ),
    isForbidden,
  )
})

test('sales routes require sales management and validate payloads before writes', async () => {
  for (const [method, path] of [
    ['GET', '/api/admin/sales'],
    ['POST', '/api/admin/sales'],
    ['PATCH', '/api/admin/sales/7'],
    ['DELETE', '/api/admin/sales/7'],
  ]) {
    await assert.rejects(handleSaleRoutes(request(method), path, admin()), isForbidden)
  }

  await assert.rejects(
    handleSaleRoutes(request('POST', {}), '/api/admin/sales', admin(['sales:manage'])),
    (error) => error?.status === 400 && error?.code === 'SALE_INVALID',
  )
})

test('farmer scoped sales enforce farm commodity boundaries', async () => {
  const { normalizeSale, validateSale } =
    await import('../../supabase/functions/admin-api/services/saleValidation.ts')
  const payload = {
    commodityIds: [101, 102],
    discountType: 'percentage',
    discountValue: 10,
    farmId: '5',
    name: 'Farm 5 Harvest Sale',
    targetUserGroup: 'all_users',
  }
  const normalized = normalizeSale(payload)
  assert.equal(normalized.farmId, '5')

  const commoditiesWithForeign = [
    { commodity_id: 101, commodity_name: 'Tomatoes', farm_id: 5, price_per_unit: 100 },
    { commodity_id: 102, commodity_name: 'Cabbage', farm_id: 99, price_per_unit: 80 },
  ]
  assert.throws(
    () => validateSale(normalized, commoditiesWithForeign, [], []),
    (err) => err?.status === 400 && err?.message.includes('belongs to another farm'),
  )

  const validCommodities = [
    { commodity_id: 101, commodity_name: 'Tomatoes', farm_id: 5, price_per_unit: 100 },
    { commodity_id: 102, commodity_name: 'Corn', farm_id: 5, price_per_unit: 80 },
  ]
  assert.doesNotThrow(() => validateSale(normalized, validCommodities, [], []))
})

test('settings and administrator management use separate privilege boundaries', async () => {
  await assert.rejects(
    handleAdminWorkspaceRoutes(request('GET'), '/api/admin/preferences', admin()),
    isForbidden,
  )
  await assert.rejects(
    handleAdminWorkspaceRoutes(
      request('POST', {}),
      '/api/admin/administrators',
      admin(['settings:manage']),
    ),
    (error) => error?.status === 403 && error?.code === 'SUPER_ADMIN_REQUIRED',
  )
  await assert.rejects(
    handleAdminWorkspaceRoutes(
      request('PUT', { autoApprove: 'yes', digest: true }),
      '/api/admin/preferences',
      admin(['settings:manage']),
    ),
    (error) => error?.status === 400 && error?.code === 'INVALID_PREFERENCES',
  )
  await assert.rejects(
    handleAdminWorkspaceRoutes(
      request('POST', {}),
      '/api/admin/administrators',
      admin(['admin:manage']),
    ),
    (error) => error?.status === 400 && error?.code === 'INVALID_ADMIN_PRIVILEGES',
  )
})
