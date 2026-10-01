import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

let db
const save = async (body, actor = 'admin@example.invalid') =>
  (
    await db.query('select public.admin_save_order($1::jsonb,$2) detail', [
      JSON.stringify(body),
      actor,
    ])
  ).rows[0].detail

before(async () => {
  db = new PGlite()
  await db.exec(await readFile(new URL('fixtures/order-schema.sql', import.meta.url), 'utf8'))
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20260914010000_admin_order_management.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20260917140000_expand_admin_order_detail.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20260919220000_add_admin_create_manual_order_rpc.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20260921133000_buyer_order_disputes.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
})
after(async () => db?.close())

test('order detail includes items and linked delivery information for management', async () => {
  const detail = (await db.query('select public.admin_order_detail(5) detail')).rows[0].detail
  assert.equal(detail.items[0].name, 'Tomatoes')
  assert.equal(detail.items[0].quantity, 2)
  assert.equal(detail.delivery.delivery_status, 'accepted')
  assert.equal('rider_name' in detail.delivery, true)
})

test('status updates use optimistic concurrency and create an attributed audit event', async () => {
  const detail = await save({
    action: 'status',
    command_id: 'status-one',
    order_id: 1,
    previous_status: 'toShip',
    status: 'preparing',
    reason: 'Farmer confirmed stock',
  })
  assert.equal(detail.order.order_status, 'preparing')
  assert.equal(detail.history[0].actor, 'admin@example.invalid')
  assert.equal(detail.history[0].event_type, 'status_changed')
  await assert.rejects(
    () =>
      save({
        action: 'status',
        command_id: 'stale-one',
        order_id: 1,
        previous_status: 'toShip',
        status: 'preparing',
        reason: 'stale',
      }),
    /changed/,
  )
})

test('cancellation decisions are review records and do not silently reopen orders', async () => {
  const detail = await save({
    action: 'review_cancellation',
    command_id: 'review-two',
    order_id: 2,
    previous_status: 'cancelled',
    decision: 'approved',
    reason: 'Buyer request and inventory release verified',
  })
  assert.equal(detail.order.order_status, 'cancelled')
  assert.equal(detail.case.cancellation_decision, 'approved')
  assert.equal(detail.history[0].event_type, 'cancellation_reviewed')
})

test('refund completion synchronizes the order and payment and is idempotent', async () => {
  const body = {
    action: 'refund',
    command_id: 'refund-two',
    order_id: 2,
    previous_status: 'cancelled',
    reference: 'GCASH-RF-22',
    reason: 'Provider refund receipt verified',
  }
  const first = await save(body)
  const retried = await save(body)
  assert.equal(first.order.payment_status, 'refunded')
  assert.equal(retried.history.filter((event) => event.event_type === 'refund_completed').length, 1)
  const payment = (
    await db.query(
      'select payment_status,refund_reference,refunded_at from public.payments where order_id=2',
    )
  ).rows[0]
  assert.equal(payment.payment_status, 'refunded')
  assert.equal(payment.refund_reference, 'GCASH-RF-22')
  assert.ok(payment.refunded_at)
})

test('exception resolution persists the resolution and timeline entry', async () => {
  const detail = await save({
    action: 'resolve_exception',
    command_id: 'resolve-three',
    order_id: 3,
    previous_status: 'failed',
    reason: 'Customer contacted; failure is final and no refund is due',
  })
  assert.equal(detail.case.exception_status, 'resolved')
  assert.match(detail.case.exception_resolution, /Customer contacted/)
  assert.equal(detail.history[0].event_type, 'exception_resolved')
})

test('delivery safeguards and cancellation side effects remain consistent', async () => {
  await assert.rejects(
    () =>
      save({
        action: 'status',
        command_id: 'deliver-four',
        order_id: 4,
        previous_status: 'readyForPickup',
        status: 'delivered',
        reason: 'Manual delivery override',
      }),
    /linked delivery must be completed/,
  )
  const detail = await save({
    action: 'status',
    command_id: 'cancel-five',
    order_id: 5,
    previous_status: 'toShip',
    status: 'cancelled',
    reason: 'Administrator confirmed duplicate order',
  })
  assert.equal(detail.order.order_status, 'cancelled')
  assert.equal(detail.delivery.delivery_status, 'cancelled')
  assert.equal(
    Number(
      (await db.query('select available_quantity from public.commodities where commodity_id=10'))
        .rows[0].available_quantity,
    ),
    7,
  )
  assert.ok(
    (await db.query('select stock_released_at from public.orders where order_id=5')).rows[0]
      .stock_released_at,
  )
})

test('admin_create_manual_order creates cart, order, items, payment and deducts stock', async () => {
  await db.query(
    "insert into public.commodities(commodity_id, commodity_name, available_quantity, price_per_unit, farm_id) values (20, 'Carrots', 20, 75, 1)",
  )

  const detail = (
    await db.query('select public.admin_create_manual_order($1::jsonb,$2) detail', [
      JSON.stringify({
        command_id: 'cmd-manual-create-1',
        customer_name: 'Mateo Dela Cruz',
        contact_number: '09181234567',
        delivery_address: '123 Market St, Baguio City',
        items: [{ commodity_id: 20, quantity: 4 }],
        payment_method: 'cash_on_delivery',
      }),
      'admin@example.invalid',
    ])
  ).rows[0].detail

  assert.equal(detail.order.order_status, 'toShip')
  assert.equal(detail.order.payment_status, 'pending_collection')
  assert.equal(detail.order.total_amount, 300)
  assert.equal(detail.order.buyer_name, 'Mateo Dela Cruz')
  assert.equal(detail.items.length, 1)
  assert.equal(detail.items[0].commodity_id, 20)
  assert.equal(detail.items[0].quantity, 4)
  assert.equal(detail.history[0].event_type, 'manual_order_created')

  // Stock deduction verified: 20 - 4 = 16
  const stock = Number(
    (await db.query('select available_quantity from public.commodities where commodity_id=20'))
      .rows[0].available_quantity,
  )
  assert.equal(stock, 16)
})

test('buyer order dispute opens exception and admin resolve_exception resolves dispute', async () => {
  // Set order 5 as delivered
  await db.query("update public.orders set order_status='delivered' where order_id=5")
  
  // Directly insert dispute into private.admin_order_cases (as buyer reporting does)
  await db.query(`
    insert into private.admin_order_cases(
      order_id, exception_status, dispute_status, dispute_category, dispute_reason, dispute_requested_resolution, dispute_submitted_at
    )
    values(5, 'open', 'pending', 'damaged_rotten_produce', 'Tomatoes arrived crushed and spoiled', 'full_refund', now())
    on conflict(order_id) do update set
      exception_status='open', dispute_status='pending', dispute_category=excluded.dispute_category,
      dispute_reason=excluded.dispute_reason, dispute_requested_resolution=excluded.dispute_requested_resolution,
      dispute_submitted_at=now()
  `)

  // Check admin_order_detail returns the dispute info and exception_status='open'
  const detailBefore = (await db.query('select public.admin_order_detail(5) detail')).rows[0].detail
  assert.equal(detailBefore.case.exception_status, 'open')
  assert.equal(detailBefore.case.dispute_status, 'pending')
  assert.equal(detailBefore.case.dispute_category, 'damaged_rotten_produce')
  assert.equal(detailBefore.case.dispute_requested_resolution, 'full_refund')
  assert.ok(detailBefore.case.dispute_reason.includes('crushed'))

  // Admin resolves the exception
  const detailAfter = await save({
    action: 'resolve_exception',
    command_id: 'cmd-resolve-dispute-5',
    order_id: 5,
    previous_status: 'delivered',
    reason: 'Approved full refund for damaged produce after inspecting photos.',
  })

  assert.equal(detailAfter.case.exception_status, 'resolved')
  assert.equal(detailAfter.case.dispute_status, 'resolved')
  assert.equal(detailAfter.case.dispute_resolution_note, 'Approved full refund for damaged produce after inspecting photos.')
  assert.ok(detailAfter.case.dispute_resolved_at)
})

