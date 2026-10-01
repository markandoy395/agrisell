import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deliveryRequest } from '../../supabase/functions/admin-api/deliveries.ts'
import { locationState, isClosed, statusActions, isOverdue } from '../src/utils/delivery.ts'
const request = {
  path: '/api/admin/deliveries',
  method: 'GET',
  permissions: ['logistics:manage'],
  actor: 'admin@example.invalid',
}
test('all delivery endpoints enforce logistics permission before database access', async () => {
  for (const path of [
    '/api/admin/deliveries',
    '/api/admin/deliveries/options',
    '/api/admin/deliveries/tracking',
    '/api/admin/deliveries/riders',
    '/api/admin/deliveries/farmer-requests',
    '/api/admin/deliveries/1',
  ]) {
    await assert.rejects(
      () =>
        deliveryRequest({ ...request, path, permissions: [] }, () => {
          throw new Error('Database must not be called')
        }),
      (e) => e.status === 403,
    )
  }
})

test('rider map requests locations independently of deliveries', async () => {
  const calls = []
  await deliveryRequest(
    { ...request, path: '/api/admin/deliveries/riders', query: new URLSearchParams('offset=200') },
    async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) })
      return { rows: [], total: 0 }
    },
  )
  assert.deepEqual(calls, [
    { path: '/rest/v1/rpc/admin_rider_tracking_rows', body: { p_offset: 200, p_limit: 200 } },
  ])
  await assert.rejects(
    () =>
      deliveryRequest(
        {
          ...request,
          path: '/api/admin/deliveries/riders',
          query: new URLSearchParams('offset=-1'),
        },
        async () => {},
      ),
    /Invalid page/,
  )
})
test('tracking requests only active delivery data and use validated pagination', async () => {
  const calls = []
  await deliveryRequest(
    {
      ...request,
      path: '/api/admin/deliveries/tracking',
      query: new URLSearchParams('offset=200'),
    },
    async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) })
      return { rows: [], total: 0 }
    },
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/rest/v1/rpc/admin_delivery_rows')
  assert.equal(calls[0].body.p_active, true)
  assert.equal(calls[0].body.p_offset, 200)
  await assert.rejects(
    () => deliveryRequest({ ...request, query: new URLSearchParams('offset=-1') }, async () => {}),
    /Invalid page/,
  )
})
test('farmer rider requests endpoint validates pagination and routes to admin_farmer_rider_requests', async () => {
  const calls = []
  await deliveryRequest(
    {
      ...request,
      path: '/api/admin/deliveries/farmer-requests',
      query: new URLSearchParams('offset=50&limit=25&status=pending&delivery_id=10'),
    },
    async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) })
      return { total: 0, pending_count: 0, rows: [] }
    },
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/rest/v1/rpc/admin_farmer_rider_requests')
  assert.deepEqual(calls[0].body, {
    p_delivery_id: 10,
    p_status: 'pending',
    p_offset: 50,
    p_limit: 25,
  })
  await assert.rejects(
    () =>
      deliveryRequest(
        {
          ...request,
          path: '/api/admin/deliveries/farmer-requests',
          query: new URLSearchParams('offset=-5'),
        },
        async () => {},
      ),
    /Invalid page offset/,
  )
  await assert.rejects(
    () =>
      deliveryRequest(
        {
          ...request,
          path: '/api/admin/deliveries/farmer-requests',
          query: new URLSearchParams('limit=0'),
        },
        async () => {},
      ),
    /Invalid page limit/,
  )
  await assert.rejects(
    () =>
      deliveryRequest(
        {
          ...request,
          path: '/api/admin/deliveries/farmer-requests',
          query: new URLSearchParams('delivery_id=bad'),
        },
        async () => {},
      ),
    /Invalid delivery ID/,
  )
})
test('mutations validate inputs and use authenticated actor rather than client identity', async () => {
  const body = {
    action: 'create',
    command_id: 'test-command',
    order_id: '1',
    scheduled_at: '2026-12-01T00:00:00Z',
    actor: 'spoofed',
  }
  await deliveryRequest({ ...request, method: 'POST', body }, async (_path, init) => {
    assert.equal(JSON.parse(init.body).p_actor, request.actor)
    return { delivery_id: 1 }
  })
  await assert.rejects(
    () =>
      deliveryRequest(
        { ...request, method: 'POST', body: { ...body, scheduled_at: 'invalid' } },
        async () => {},
      ),
    /valid delivery schedule/,
  )
  await assert.rejects(
    () =>
      deliveryRequest(
        { ...request, method: 'POST', body: { ...body, command_id: '' } },
        async () => {},
      ),
    /command ID/,
  )
})
test('explicit completion uses the audited admin completion RPC', async () => {
  const calls = []
  const body = {
    action: 'complete',
    command_id: 'complete-command',
    delivery_id: '1',
    previous_status: 'accepted',
    reason: 'Verified by administrator',
  }
  await deliveryRequest({ ...request, method: 'POST', body }, async (path, init) => {
    calls.push({ path, args: JSON.parse(init.body) })
    return { delivery_id: 1 }
  })
  assert.equal(calls[0].path, '/rest/v1/rpc/admin_complete_delivery')
  assert.equal(calls[0].args.p_actor, request.actor)
  await assert.rejects(
    () =>
      deliveryRequest(
        { ...request, method: 'POST', body: { ...body, reason: ' ' } },
        async () => {},
      ),
    /completion reason/,
  )
})
test('deletion uses the audited admin deletion RPC', async () => {
  const calls = []
  const body = {
    action: 'delete',
    command_id: 'delete-command',
    delivery_id: '1',
    previous_status: 'completed',
  }
  await deliveryRequest({ ...request, method: 'POST', body }, async (path, init) => {
    calls.push({ path, args: JSON.parse(init.body) })
    return { delivery_id: 1, deleted: true }
  })
  assert.equal(calls[0].path, '/rest/v1/rpc/admin_delete_delivery')
  assert.equal(calls[0].args.p_actor, request.actor)
})
test('edit and retry actions validate input and use their audited RPCs', async () => {
  const calls = []
  const update = {
    action: 'update',
    command_id: 'update-command',
    delivery_id: '1',
    previous_status: 'available',
    pickup_location: 'Farm gate',
    dropoff_location: 'Public market',
    scheduled_at: '2026-12-03T09:30:00Z',
  }
  await deliveryRequest({ ...request, method: 'POST', body: update }, async (path) => {
    calls.push(path)
    return { delivery_id: 1 }
  })
  await deliveryRequest(
    {
      ...request,
      method: 'POST',
      body: {
        action: 'reopen',
        command_id: 'retry-command',
        delivery_id: '1',
        previous_status: 'failed',
        reason: 'Retry approved',
      },
    },
    async (path) => {
      calls.push(path)
      return { delivery_id: 1 }
    },
  )
  assert.deepEqual(calls, [
    '/rest/v1/rpc/admin_update_delivery',
    '/rest/v1/rpc/admin_reopen_delivery',
  ])
  await assert.rejects(
    () =>
      deliveryRequest(
        { ...request, method: 'POST', body: { ...update, scheduled_at: 'invalid' } },
        async () => {},
      ),
    /valid delivery schedule/,
  )
})
test('database migration and stale-write errors have actionable HTTP responses', async () => {
  await assert.rejects(
    () =>
      deliveryRequest(request, async () => {
        throw new Error('Could not find the function in the schema cache')
      }),
    (e) => e.status === 503,
  )
  await assert.rejects(
    () =>
      deliveryRequest(request, async () => {
        throw new Error('Delivery changed; refresh before saving')
      }),
    (e) => e.status === 409,
  )
})
test('private evidence gets a short-lived signed link and unsafe paths are not signed', async () => {
  const calls = []
  const result = await deliveryRequest(
    { ...request, path: '/api/admin/deliveries/1', storageOrigin: 'https://example.supabase.co' },
    async (path, init) => {
      calls.push(path)
      if (path.includes('/rpc/'))
        return {
          proofs: [
            { proof_id: '1', file_path: 'rider/1/proof.jpg' },
            { proof_id: '2', file_path: '../bad' },
          ],
        }
      assert.equal(JSON.parse(init.body).expiresIn, 300)
      return { signedURL: '/object/sign/delivery-proofs/rider/1/proof.jpg?token=test' }
    },
  )
  assert.equal(calls.length, 2)
  assert.match(result.body.proofs[0].signed_path, /^https:\/\/example.supabase.co\/storage/)
  assert.equal('file_path' in result.body.proofs[0], false)
  assert.equal(result.body.proofs[1].signed_path, undefined)
})
test('GPS labels handle missing, stale, invalid times and real zero coordinates', () => {
  const now = Date.now()
  const d = {
    rider_id: 'rider',
    latitude: 0,
    longitude: 0,
    location_updated_at: new Date(now).toISOString(),
  }
  assert.equal(locationState(d, now), 'Recent location')
  assert.equal(locationState({ ...d, rider_id: null }, now), 'Unassigned')
  assert.equal(locationState({ ...d, latitude: null }, now), 'No location')
  assert.equal(locationState({ ...d, latitude: NaN }, now), 'No location')
  assert.equal(locationState({ ...d, location_updated_at: null }, now), 'Update time unknown')
  assert.equal(
    locationState({ ...d, location_updated_at: new Date(now - 121000).toISOString() }, now),
    'Stale location',
  )
  assert.equal(
    locationState({ ...d, location_updated_at: new Date(now + 121000).toISOString() }, now),
    'Update time invalid',
  )
  assert.equal(isClosed('not_delivered'), false)
  assert.equal(isClosed('completed'), true)
  assert.equal(isClosed('expired'), true)
  assert.equal(
    isOverdue({ delivery_status: 'completed', estimated_delivery_time: '2000-01-01' }, now),
    false,
  )
  assert.equal(statusActions('arrived_at_pickup').includes('picked_up'), false)
})
