import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
let db
const detail = async (id = 1) =>
  (await db.query('select public.admin_payment_detail($1) detail', [id])).rows[0].detail
const save = async (body) =>
  (
    await db.query('select public.admin_save_payment_action($1::jsonb,$2) detail', [
      JSON.stringify(body),
      'finance@example.invalid',
    ])
  ).rows[0].detail
before(async () => {
  db = new PGlite()
  await db.exec(await readFile(new URL('fixtures/payment-schema.sql', import.meta.url), 'utf8'))
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20260915010000_admin_financial_operations.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    'update public.payments set amount_received=case payment_id when 1 then 96 else 75 end',
  )
})
after(async () => db?.close())
test('verification and settlement require references and preserve audit attribution', async () => {
  let current = await detail()
  current = await save({
    action: 'verify',
    decision: 'verified',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'verify-one',
    reference: 'GCASH-100',
    reason: 'Matched provider receipt',
  })
  assert.equal(current.payment.verification_status, 'verified')
  assert.equal(current.history[0].actor, 'finance@example.invalid')
  await assert.rejects(
    () =>
      save({
        action: 'settlement',
        decision: 'settled',
        payment_id: 1,
        previous_version: current.payment.version,
        command_id: 'settle-bad',
        reference: 'BANK-1',
        reason: 'attempt',
      }),
    /approved before/,
  )
  current = await save({
    action: 'settlement',
    decision: 'approved',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'settle-approve',
    reason: 'Reconciled',
  })
  current = await save({
    action: 'settlement',
    decision: 'settled',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'settle-final',
    reference: 'BANK-1',
    reason: 'Bank batch confirmed',
  })
  assert.equal(current.payment.settlement_status, 'settled')
})
test('payouts, partial refunds, disputes, and failed handling are ledger records', async () => {
  let current = await detail()
  current = await save({
    action: 'payout',
    decision: 'approved',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'payout-approve',
    amount: 90,
    reason: 'Payout checked',
  })
  current = await save({
    action: 'payout',
    decision: 'paid',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'payout-one',
    amount: 90,
    reference: 'PAYOUT-1',
    reason: 'Bank transfer confirmed',
  })
  assert.equal(current.payout.payout_status, 'paid')
  current = await save({
    action: 'refund',
    decision: 'approved',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'refund-approve',
    amount: 25,
    reason: 'Partial quality refund approved',
  })
  current = await save({
    action: 'refund',
    decision: 'completed',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'refund-one',
    amount: 25,
    reference: 'REFUND-1',
    reason: 'Partial quality refund sent',
  })
  assert.equal(current.refunds[0].refund_status, 'completed')
  current = await save({
    action: 'dispute',
    decision: 'open',
    payment_id: 1,
    previous_version: current.payment.version,
    command_id: 'dispute-one',
    reason: 'Customer chargeback notice',
  })
  assert.equal(current.payment.settlement_status, 'held')
  let failed = await detail(2)
  failed = await save({
    action: 'failed',
    decision: 'retry_requested',
    payment_id: 2,
    previous_version: failed.payment.version,
    command_id: 'failed-two',
    reason: 'Issuer timeout; request another attempt',
  })
  assert.equal(failed.case.failure_status, 'retry_requested')
  const report = (await db.query('select public.admin_payment_report() report')).rows[0].report
  assert.equal(report.length, 2)
})
