if (!globalThis.Deno) {
  globalThis.Deno = { env: { get: () => '' } }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { handleReviewRoutes } = await import(
  '../../supabase/functions/admin-api/handlers/reviews.ts'
)
const { routeAdminReview } = await import(
  '../../backend/src/routes/adminReviewRoutes.js'
)

const createAdmin = (permissions = ['reviews:manage']) => ({
  id: 'admin-1',
  email: 'moderator@example.test',
  name: 'Review Moderator',
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

test('review routes require reviews:manage or admin:manage permission', async () => {
  const request = new Request('http://localhost/api/admin/reviews/farmer/1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Valid reply', mode: 'public' }),
  })
  await assert.rejects(
    () => handleReviewRoutes(request, '/api/admin/reviews/farmer/1/responses', createAdmin([])),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )
  const moderationRequest = new Request('http://localhost/api/admin/reviews/rider/1/moderation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'hide' }),
  })
  await assert.rejects(
    () =>
      handleReviewRoutes(
        moderationRequest,
        '/api/admin/reviews/rider/1/moderation',
        createAdmin([]),
      ),
    (error) => error.status === 403 && error.code === 'ADMIN_PRIVILEGE_REQUIRED',
  )
})

test('review response validation rejects invalid mode or oversized message', async () => {
  const admin = createAdmin()
  const oversizedPublic = new Request('http://localhost/api/admin/reviews/farmer/1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'a'.repeat(501), mode: 'public' }),
  })
  await assert.rejects(
    () =>
      handleReviewRoutes(oversizedPublic, '/api/admin/reviews/farmer/1/responses', admin),
    (error) => error.status === 400 && error.code === 'INVALID_REVIEW_RESPONSE',
  )

  const invalidMode = new Request('http://localhost/api/admin/reviews/farmer/1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello', mode: 'broadcast' }),
  })
  await assert.rejects(
    () => handleReviewRoutes(invalidMode, '/api/admin/reviews/farmer/1/responses', admin),
    (error) => error.status === 400 && error.code === 'INVALID_REVIEW_RESPONSE',
  )
})

test('review moderation validation rejects invalid actions, notes, or flags', async () => {
  const admin = createAdmin()
  const invalidAction = new Request('http://localhost/api/admin/reviews/farmer/1/moderation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_forever' }),
  })
  await assert.rejects(
    () =>
      handleReviewRoutes(invalidAction, '/api/admin/reviews/farmer/1/moderation', admin),
    (error) => error.status === 400 && error.code === 'INVALID_REVIEW_MODERATION',
  )

  const missingFlag = new Request('http://localhost/api/admin/reviews/farmer/1/moderation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add_abuse_flag' }),
  })
  await assert.rejects(
    () => handleReviewRoutes(missingFlag, '/api/admin/reviews/farmer/1/moderation', admin),
    (error) => error.status === 400 && error.code === 'INVALID_REVIEW_MODERATION',
  )

  const oversizedNote = new Request('http://localhost/api/admin/reviews/farmer/1/moderation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'hide', note: 'x'.repeat(501) }),
  })
  await assert.rejects(
    () =>
      handleReviewRoutes(oversizedNote, '/api/admin/reviews/farmer/1/moderation', admin),
    (error) => error.status === 400 && error.code === 'INVALID_REVIEW_MODERATION',
  )
})

test('node backend review routes guard unauthorized actions', async () => {
  const mockRes = createMockResponse()
  const req = {
    admin: { email: 'user@example.test', permissions: [] },
    method: 'POST',
  }
  const handled = await routeAdminReview(
    req,
    mockRes,
    '/api/admin/reviews/farmer/1/responses',
  )
  assert.equal(handled, true)
  assert.equal(mockRes.result.statusCode, 403)
  assert.equal(mockRes.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED')
})
