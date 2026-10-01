if (!globalThis.Deno) {
  globalThis.Deno = { env: { get: () => '' } }
}

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { safetyRequest } = await import(
  '../../supabase/functions/admin-api/safety.ts'
)
const { routeAdminApiProxy } = await import(
  '../../backend/src/routes/adminApiProxyRoutes.js'
)

const createAdmin = (permissions = ['logistics:manage'], email = 'safety-admin@example.test') => ({
  actor: email,
  permissions,
})

const createMockResponse = () => {
  const result = { headers: {}, statusCode: 200, body: undefined }
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

test('safety routes require logistics:manage or admin:manage permission', async () => {
  const mockDb = async () => ({})

  await assert.rejects(
    () =>
      safetyRequest(
        {
          path: '/api/admin/safety',
          method: 'GET',
          permissions: [],
          actor: 'unauthorized@example.test',
        },
        mockDb,
      ),
    (error) => error.status === 403 && /Logistics management permission is required/.test(error.message),
  )

  await assert.rejects(
    () =>
      safetyRequest(
        {
          path: '/api/admin/safety/resolve',
          method: 'POST',
          permissions: ['reviews:manage'],
          actor: 'unauthorized@example.test',
          body: { reportId: 'rep-1', status: 'resolved', notes: 'Done' },
        },
        mockDb,
      ),
    (error) => error.status === 403,
  )
})

test('safety GET /api/admin/safety dispatches to admin_safety_incidents RPC', async () => {
  let calledRpc = null
  let calledArgs = null

  const mockDb = async (path, init) => {
    calledRpc = path
    calledArgs = JSON.parse(init.body)
    return {
      incidents: [
        {
          report_id: 'rep-101',
          rider_id: 'rider-01',
          category: 'emergencySos',
          status: 'submitted',
        },
      ],
      summary: {
        total_reports: 1,
        active_emergencies: 1,
        accidents: 0,
        under_investigation: 0,
        resolved: 0,
      },
    }
  }

  const query = new URLSearchParams({
    status: 'submitted',
    search: 'rider-01',
    offset: '0',
    limit: '25',
  })

  const res = await safetyRequest(
    {
      path: '/api/admin/safety',
      method: 'GET',
      permissions: ['logistics:manage'],
      actor: 'dispatcher@example.test',
      query,
    },
    mockDb,
  )

  assert.equal(res.status, 200)
  assert.equal(calledRpc, '/rest/v1/rpc/admin_safety_incidents')
  assert.deepEqual(calledArgs, {
    p_status: 'submitted',
    p_search: 'rider-01',
    p_offset: 0,
    p_limit: 25,
  })
  assert.equal(res.body.summary.active_emergencies, 1)
  assert.equal(res.body.incidents.length, 1)
})

test('safety GET validates pagination limits', async () => {
  const mockDb = async () => ({})

  await assert.rejects(
    () =>
      safetyRequest(
        {
          path: '/api/admin/safety',
          method: 'GET',
          permissions: ['logistics:manage'],
          actor: 'dispatcher@example.test',
          query: new URLSearchParams({ offset: '-5' }),
        },
        mockDb,
      ),
    (error) => error.status === 400 && /Invalid page offset/.test(error.message),
  )

  await assert.rejects(
    () =>
      safetyRequest(
        {
          path: '/api/admin/safety',
          method: 'GET',
          permissions: ['logistics:manage'],
          actor: 'dispatcher@example.test',
          query: new URLSearchParams({ limit: '500' }),
        },
        mockDb,
      ),
    (error) => error.status === 400 && /Invalid page limit/.test(error.message),
  )
})

test('safety POST /api/admin/safety/resolve validates body and calls admin_resolve_safety_incident', async () => {
  let calledRpc = null
  let calledArgs = null

  const mockDb = async (path, init) => {
    calledRpc = path
    calledArgs = JSON.parse(init.body)
    return {
      report_id: 'rep-101',
      status: 'resolved',
      resolved_at: '2026-09-19T10:00:00Z',
    }
  }

  // Missing reportId
  await assert.rejects(
    () =>
      safetyRequest(
        {
          path: '/api/admin/safety/resolve',
          method: 'POST',
          permissions: ['logistics:manage'],
          actor: 'admin@example.test',
          body: { status: 'resolved', notes: 'Checked' },
        },
        mockDb,
      ),
    (error) => error.status === 400 && /Report ID is required/.test(error.message),
  )

  // Invalid status
  await assert.rejects(
    () =>
      safetyRequest(
        {
          path: '/api/admin/safety/resolve',
          method: 'POST',
          permissions: ['logistics:manage'],
          actor: 'admin@example.test',
          body: { reportId: 'rep-101', status: 'invalid_status', notes: 'Checked' },
        },
        mockDb,
      ),
    (error) => error.status === 400 && /valid resolution status/.test(error.message),
  )

  // Missing notes
  await assert.rejects(
    () =>
      safetyRequest(
        {
          path: '/api/admin/safety/resolve',
          method: 'POST',
          permissions: ['logistics:manage'],
          actor: 'admin@example.test',
          body: { reportId: 'rep-101', status: 'resolved', notes: '' },
        },
        mockDb,
      ),
    (error) => error.status === 400 && /Resolution notes are required/.test(error.message),
  )

  // Valid resolution
  const res = await safetyRequest(
    {
      path: '/api/admin/safety/resolve',
      method: 'POST',
      permissions: ['logistics:manage'],
      actor: 'admin@example.test',
      body: {
        reportId: 'rep-101',
        status: 'resolved',
        notes: 'Contacted rider, emergency services dispatched, rider confirmed safe.',
      },
    },
    mockDb,
  )

  assert.equal(res.status, 200)
  assert.equal(calledRpc, '/rest/v1/rpc/admin_resolve_safety_incident')
  assert.deepEqual(calledArgs, {
    p_report_id: 'rep-101',
    p_status: 'resolved',
    p_notes: 'Contacted rider, emergency services dispatched, rider confirmed safe.',
    p_actor: 'admin@example.test',
  })
})

test('node backend proxy routes safety request with permissions check', async () => {
  const mockRes = createMockResponse()
  const req = {
    admin: { email: 'user@example.test', permissions: ['payments:manage'] },
    method: 'GET',
    url: 'http://localhost/api/admin/safety',
  }

  const handled = await routeAdminApiProxy(req, mockRes, '/api/admin/safety')
  assert.equal(handled, true)
  assert.equal(mockRes.result.statusCode, 403)
  assert.equal(mockRes.result.body.code, 'ADMIN_PRIVILEGE_REQUIRED')
})
