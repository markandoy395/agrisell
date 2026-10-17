import test from 'node:test'
import assert from 'node:assert/strict'
import { paymentRequest } from '../../supabase/functions/admin-api/payments.ts'

const input = {
  path: '/api/admin/payments/payout-requests',
  method: 'POST',
  permissions: ['payments:manage'],
  actor: 'finance@example.test',
  body: {
    request_id: '12345678-1234-1234-1234-123456789abc',
    action: 'mark_paid',
    payout_reference: "GCASH-' ; -- %_",
  },
}
test('payout records the transfer reference as bound data with the trusted actor', async () => {
  const calls = []
  await paymentRequest(input, async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) })
    return { success: true }
  })
  assert.equal(calls[0].path, '/rest/v1/rpc/admin_update_payout_request')
  assert.deepEqual(calls[0].body, { p_input: input.body, p_actor: input.actor })
})
test('payout writes reject view-only permissions and missing actor', async () => {
  for (const override of [{ permissions: ['payments:view'] }, { actor: '' }]) {
    await assert.rejects(
      () =>
        paymentRequest({ ...input, ...override }, async () => {
          assert.fail('Denied commands must not reach the database')
        }),
      (e) => [401, 403].includes(e.status),
    )
  }
})
test('invalid references, request IDs, actions and rejection reasons are rejected', async () => {
  for (const override of [
    { payout_reference: '' },
    { payout_reference: 'x'.repeat(201) },
    { request_id: 'bad-id' },
    { action: 'send_funds' },
    { action: 'reject', rejection_reason: '' },
  ]) {
    await assert.rejects(
      () =>
        paymentRequest({ ...input, body: { ...input.body, ...override } }, async () =>
          assert.fail('Invalid commands must not reach the database'),
        ),
      (e) => e.status === 400,
    )
  }
})
test('payout read failures remain visible instead of displaying a successful empty list', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      paymentRequest({ ...input, method: 'GET' }, async () => {
        calls++
        throw new Error('schema cache: function does not exist')
      }),
    (e) => e.status === 503,
  )
  assert.equal(calls, 1)
})
test('payout uniqueness conflicts preserve the conflict response', async () => {
  await assert.rejects(
    () =>
      paymentRequest(input, async () => {
        throw new Error('duplicate key violates unique payout reference')
      }),
    (e) => e.status === 409,
  )
})
