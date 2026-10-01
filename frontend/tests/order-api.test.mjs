import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orderRequest } from '../../supabase/functions/admin-api/orders.ts'

const request = {
  path: '/api/admin/orders/12',
  method: 'GET',
  permissions: ['orders:manage'],
  actor: 'admin@example.invalid',
}

test('all order endpoints enforce order permission before database access', async () => {
  for (const input of [
    request,
    { ...request, path: '/api/admin/orders', method: 'POST', body: {} },
  ]) {
    await assert.rejects(
      () =>
        orderRequest({ ...input, permissions: [] }, () => {
          throw new Error('Database must not be called')
        }),
      (error) => error.status === 403,
    )
  }
})

test('order detail uses the audited detail RPC', async () => {
  const calls = []
  const result = await orderRequest(request, async (path, init) => {
    calls.push({ path, body: JSON.parse(init.body) })
    return { order: { order_id: 12 } }
  })
  assert.equal(result.status, 200)
  assert.deepEqual(calls, [{ path: '/rest/v1/rpc/admin_order_detail', body: { p_order_id: '12' } }])
})

test('mutations validate action-specific input and derive the actor from the session', async () => {
  const body = {
    action: 'refund',
    command_id: 'refund-command',
    order_id: '12',
    previous_status: 'cancelled',
    reason: 'Verified original payment',
    reference: 'RF-123',
    actor: 'spoofed',
  }
  const calls = []
  await orderRequest(
    { ...request, path: '/api/admin/orders', method: 'POST', body },
    async (path, init) => {
      calls.push({ path, args: JSON.parse(init.body) })
      return {}
    },
  )
  assert.equal(calls[0].path, '/rest/v1/rpc/admin_save_order')
  assert.equal(calls[0].args.p_actor, request.actor)
  assert.equal(calls[0].args.p_input.actor, 'spoofed')
  await assert.rejects(
    () =>
      orderRequest(
        { ...request, path: '/api/admin/orders', method: 'POST', body: { ...body, reference: '' } },
        async () => {},
      ),
    /refund reference/,
  )
  await assert.rejects(
    () =>
      orderRequest(
        {
          ...request,
          path: '/api/admin/orders',
          method: 'POST',
          body: { ...body, command_id: '' },
        },
        async () => {},
      ),
    /command ID/,
  )
})

test('create_manual_order validates payload and calls admin_create_manual_order RPC', async () => {
  const manualOrderBody = {
    action: 'create_manual_order',
    command_id: 'cmd-manual-101',
    customer_name: 'Elena Rostova',
    contact_number: '09171234567',
    delivery_address: 'Barangay San Jose, Antipolo, Rizal',
    items: [{ commodity_id: '5', quantity: 3 }],
    payment_method: 'cash_on_delivery',
  }
  const calls = []
  const result = await orderRequest(
    { ...request, path: '/api/admin/orders', method: 'POST', body: manualOrderBody },
    async (path, init) => {
      calls.push({ path, args: JSON.parse(init.body) })
      return { order: { order_id: 99, order_status: 'toShip' } }
    },
  )
  assert.equal(result.status, 201)
  assert.equal(calls[0].path, '/rest/v1/rpc/admin_create_manual_order')
  assert.equal(calls[0].args.p_actor, request.actor)
  assert.equal(calls[0].args.p_input.customer_name, 'Elena Rostova')

  // Validation failures
  await assert.rejects(
    () =>
      orderRequest(
        { ...request, path: '/api/admin/orders', method: 'POST', body: { ...manualOrderBody, items: [] } },
        async () => {},
      ),
    /order item is required/,
  )
  await assert.rejects(
    () =>
      orderRequest(
        {
          ...request,
          path: '/api/admin/orders',
          method: 'POST',
          body: { ...manualOrderBody, customer_name: '', buyer_user_id: '' },
        },
        async () => {},
      ),
    /customer name or existing buyer is required/,
  )
})

test('database migration and stale-write failures are actionable', async () => {
  await assert.rejects(
    () =>
      orderRequest(request, async () => {
        throw new Error('Could not find the function in the schema cache')
      }),
    (error) => error.status === 503,
  )
  await assert.rejects(
    () =>
      orderRequest(request, async () => {
        throw new Error('Order changed; refresh before saving')
      }),
    (error) => error.status === 409,
  )
})

