if (!globalThis.Deno) {
  globalThis.Deno = { env: { get: () => '' } }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { handleBroadcastRoutes } = await import(
  '../../supabase/functions/admin-api/handlers/broadcasts.ts'
)
const { routeAdminBroadcast } = await import(
  '../../backend/src/routes/adminBroadcastRoutes.js'
)
const {
  AdminBroadcastError,
  broadcastAnnouncement,
  getAudienceCounts,
  listBroadcastHistory,
  resolveAudienceAuthUserIds,
} = await import('../../backend/src/services/adminBroadcastService.js')

const createAdmin = (permissions = ['support:manage']) => ({
  id: 'admin-test-1',
  email: 'admin@example.test',
  name: 'Broadcast Admin',
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

test('broadcast routes require support:manage, users:manage, or admin:manage permission', async () => {
  const postRequest = new Request('http://localhost/api/admin/broadcasts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Platform Announcement',
      message: 'Hello mobile users',
      targetSegment: 'all',
    }),
  })

  // Edge handler blocks with 403 when permission missing
  await assert.rejects(
    () => handleBroadcastRoutes(postRequest, '/api/admin/broadcasts', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )

  // Backend router blocks with 403 when permission missing
  const response = createMockResponse()
  const handled = await routeAdminBroadcast(
    {
      admin: { email: 'test@example.com', permissions: ['orders:manage'] },
      method: 'POST',
      url: '/api/admin/broadcasts',
    },
    response,
    '/api/admin/broadcasts',
  )

  assert.equal(handled, true)
  assert.equal(response.result.statusCode, 403)
  assert.equal(response.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED')
})

test('broadcast validation rejects invalid or empty payloads', async () => {
  // Empty title
  await assert.rejects(
    () =>
      broadcastAnnouncement({
        adminEmail: 'admin@test.com',
        title: '',
        message: 'Valid message body',
        targetSegment: 'all',
      }),
    (err) => err instanceof AdminBroadcastError && err.code === 'INVALID_TITLE',
  )

  // Empty message
  await assert.rejects(
    () =>
      broadcastAnnouncement({
        adminEmail: 'admin@test.com',
        title: 'Valid Title',
        message: '',
        targetSegment: 'all',
      }),
    (err) => err instanceof AdminBroadcastError && err.code === 'INVALID_MESSAGE',
  )

  // Invalid segment
  await assert.rejects(
    () =>
      broadcastAnnouncement({
        adminEmail: 'admin@test.com',
        title: 'Valid Title',
        message: 'Valid message body',
        targetSegment: 'aliens',
      }),
    (err) => err instanceof AdminBroadcastError && err.code === 'INVALID_SEGMENT',
  )

  // Invalid type
  await assert.rejects(
    () =>
      broadcastAnnouncement({
        adminEmail: 'admin@test.com',
        title: 'Valid Title',
        message: 'Valid message body',
        targetSegment: 'all',
        notificationType: 'unsupported_type',
      }),
    (err) => err instanceof AdminBroadcastError && err.code === 'INVALID_TYPE',
  )

  // Invalid destination
  await assert.rejects(
    () =>
      broadcastAnnouncement({
        adminEmail: 'admin@test.com',
        title: 'Valid Title',
        message: 'Valid message body',
        targetSegment: 'all',
        notificationType: 'announcement',
        destination: 'invalid_destination',
      }),
    (err) => err instanceof AdminBroadcastError && err.code === 'INVALID_DESTINATION',
  )
})

test('broadcast service safely resolves audiences and lists history', async () => {
  const [allUsers, buyers, farmers, riders] = await Promise.all([
    resolveAudienceAuthUserIds('all'),
    resolveAudienceAuthUserIds('buyers'),
    resolveAudienceAuthUserIds('farmers'),
    resolveAudienceAuthUserIds('riders'),
  ])

  assert.ok(Array.isArray(allUsers))
  assert.ok(Array.isArray(buyers))
  assert.ok(Array.isArray(farmers))
  assert.ok(Array.isArray(riders))

  const counts = await getAudienceCounts()
  assert.equal(typeof counts.all, 'number')
  assert.equal(typeof counts.buyers, 'number')
  assert.equal(typeof counts.farmers, 'number')
  assert.equal(typeof counts.riders, 'number')

  const history = await listBroadcastHistory({ limit: 10 })
  assert.ok(Array.isArray(history.broadcasts))
  assert.equal(typeof history.totalCount, 'number')
})
