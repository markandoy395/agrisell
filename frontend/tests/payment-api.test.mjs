import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paymentRequest } from '../../supabase/functions/admin-api/payments.ts'
const base = {
  path: '/api/admin/payments/1',
  method: 'GET',
  permissions: ['payments:view'],
  actor: 'admin@example.invalid',
}
test('payment reads and mutations have separate privileges', async () => {
  await assert.rejects(
    () => paymentRequest({ ...base, permissions: [] }, () => {}),
    (e) => e.status === 403,
  )
  await assert.rejects(
    () =>
      paymentRequest(
        {
          ...base,
          path: '/api/admin/payments',
          method: 'POST',
          body: {},
          permissions: ['payments:view'],
        },
        () => {},
      ),
    (e) => e.status === 403,
  )
})
test('payment detail and accounting report use service RPCs', async () => {
  const calls = []
  await paymentRequest(base, async (path) => {
    calls.push(path)
    return { payment: { payment_id: 1 } }
  })
  await paymentRequest({ ...base, path: '/api/admin/payments/report' }, async (path) => {
    calls.push(path)
    return []
  })
  assert.deepEqual(calls, [
    '/rest/v1/rpc/admin_payment_detail',
    '/rest/v1/rpc/admin_payment_report',
  ])
})
test('financial commands validate references, amounts, and session actor', async () => {
  const body = {
    action: 'refund',
    decision: 'completed',
    payment_id: '1',
    previous_version: '1',
    command_id: 'refund-command',
    reason: 'Customer evidence verified',
    amount: 25,
    reference: 'RF-1',
  }
  const calls = []
  await paymentRequest(
    {
      ...base,
      path: '/api/admin/payments',
      method: 'POST',
      permissions: ['payments:manage'],
      body,
    },
    async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) })
      return {}
    },
  )
  assert.equal(calls[0].body.p_actor, base.actor)
  await assert.rejects(
    () =>
      paymentRequest(
        {
          ...base,
          path: '/api/admin/payments',
          method: 'POST',
          permissions: ['payments:manage'],
          body: { ...body, reference: '' },
        },
        () => {},
      ),
    /reference/,
  )
  await assert.rejects(
    () =>
      paymentRequest(
        {
          ...base,
          path: '/api/admin/payments',
          method: 'POST',
          permissions: ['payments:manage'],
          body: { ...body, amount: 0 },
        },
        () => {},
      ),
    /amount/,
  )
})
