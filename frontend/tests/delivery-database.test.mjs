import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
let db
const rider = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
const sql = (text, args = []) => db.query(text, args)
const save = async (body) =>
  (
    await sql('select public.admin_save_delivery($1::jsonb,$2) as result', [
      JSON.stringify(body),
      'test-admin@example.invalid',
    ])
  ).rows[0].result
const create = (order, key) =>
  save({ action: 'create', order_id: order, scheduled_at: '2026-12-01T08:00:00Z', command_id: key })
before(async () => {
  db = new PGlite()
  for (const file of [
    'fixtures/delivery-schema.sql',
    'fixtures/create-delivery-dependency.sql',
    'fixtures/assignment-validation-dependency.sql',
    '../../supabase/migrations/20260907010000_admin_deliveries.sql',
    '../../supabase/migrations/20260909010000_admin_rider_tracking.sql',
    '../../supabase/migrations/20260910010000_admin_delivery_completion.sql',
    '../../supabase/migrations/20260910020000_allow_audited_admin_completion.sql',
    '../../supabase/migrations/20260910030000_admin_delete_delivery.sql',
    '../../supabase/migrations/20260910040000_sync_completed_delivery_orders.sql',
    '../../supabase/migrations/20260917130000_admin_delivery_edit_retry.sql',
  ])
    await db.exec(await readFile(new URL(file, import.meta.url), 'utf8'))
})
after(async () => {
  await db?.close()
})
test('rider tracking includes riders without deliveries or GPS and enforces access', async () => {
  const page = (await sql('select public.admin_rider_tracking_rows(0,1) result')).rows[0].result
  assert.equal(page.total, 2)
  assert.equal(page.rows.length, 1)
  assert.equal(page.rows[0].rider_id, rider)
  assert.equal(page.rows[0].latitude, null)
  const next = (await sql('select public.admin_rider_tracking_rows(1,1) result')).rows[0].result
  assert.equal(next.rows[0].rider_id, second)
  await db.exec('set role authenticated')
  await assert.rejects(() => sql('select public.admin_rider_tracking_rows()'), /permission denied/)
  await db.exec('reset role; set role service_role')
  assert.equal(
    (await sql('select public.admin_rider_tracking_rows() result')).rows[0].result.total,
    2,
  )
  await db.exec('reset role')
})
test('create persists fulfillment, schedule, order readiness, and audit; retry is idempotent', async () => {
  const result = await create(1, 'create-one')
  assert.equal(result.delivery_id, 1)
  assert.deepEqual(await create(1, 'create-one'), result)
  assert.equal((await sql('select count(*)::int n from public.deliveries')).rows[0].n, 1)
  assert.equal(
    (await sql('select order_status from public.orders where order_id=1')).rows[0].order_status,
    'readyForPickup',
  )
  assert.equal(
    (await sql('select count(*)::int n from private.delivery_status_events')).rows[0].n,
    1,
  )
  await assert.rejects(() => create(2, 'create-one'), /already used/)
  await assert.rejects(() => create(1, 'duplicate-one'), /already has a delivery/)
})
test('assignment uses approved rider, existing request and assignment tables, and optimistic concurrency', async () => {
  const body = {
    action: 'assign',
    delivery_id: 1,
    previous_status: 'available',
    rider_id: rider,
    command_id: 'assign-one',
  }
  await save(body)
  await save(body)
  assert.equal(
    (await sql('select rider_id from private.rider_delivery_assignments')).rows[0].rider_id,
    rider,
  )
  assert.equal(
    (await sql('select status from public.rider_assignment_requests')).rows[0].status,
    'accepted',
  )
  await assert.rejects(() => save({ ...body, command_id: 'assign-stale' }), /changed/)
  await assert.rejects(
    () =>
      save({
        ...body,
        previous_status: 'accepted',
        previous_rider_id: rider,
        rider_id: second,
        command_id: 'no-reason',
      }),
    /reason required/,
  )
})
test('capacity validation rolls back the entire assignment', async () => {
  await create(2, 'create-two')
  await assert.rejects(
    () =>
      save({
        action: 'assign',
        delivery_id: 2,
        previous_status: 'available',
        rider_id: rider,
        command_id: 'over-capacity',
      }),
    /active_delivery_limit_reached/,
  )
  assert.equal(
    (
      await sql(
        'select count(*)::int n from private.rider_delivery_assignments where delivery_id=2',
      )
    ).rows[0].n,
    0,
  )
  assert.equal(
    (await sql('select count(*)::int n from public.rider_assignment_requests where delivery_id=2'))
      .rows[0].n,
    0,
  )
})
test('status rules reject missing reasons, skipped stages, and bypasses of pickup/completion evidence', async () => {
  await assert.rejects(
    () =>
      save({
        action: 'status',
        delivery_id: 1,
        previous_status: 'accepted',
        status: 'going_to_pickup',
        command_id: 'no-status-reason',
      }),
    /reason/,
  )
  for (const status of ['completed', 'picked_up', 'arrived_at_delivery'])
    await assert.rejects(
      () =>
        save({
          action: 'status',
          delivery_id: 1,
          previous_status: 'accepted',
          status,
          reason: 'test',
          command_id: `skip-${status}`,
        }),
      /Invalid transition/,
    )
  await save({
    action: 'status',
    delivery_id: 1,
    previous_status: 'accepted',
    status: 'going_to_pickup',
    reason: 'Dispatch confirmed',
    command_id: 'dispatch-one',
  })
  assert.equal(
    (await sql('select delivery_status from public.deliveries where delivery_id=1')).rows[0]
      .delivery_status,
    'going_to_pickup',
  )
})
test('explicit admin completion is audited, records completion time, and is idempotent', async () => {
  const body = {
    action: 'complete',
    delivery_id: 2,
    previous_status: 'available',
    reason: 'Order verified by administrator',
    command_id: 'complete-two',
  }
  const result = (
    await sql('select public.admin_complete_delivery($1::jsonb,$2) result', [
      JSON.stringify(body),
      'test-admin@example.invalid',
    ])
  ).rows[0].result
  assert.deepEqual(
    (
      await sql('select public.admin_complete_delivery($1::jsonb,$2) result', [
        JSON.stringify(body),
        'test-admin@example.invalid',
      ])
    ).rows[0].result,
    result,
  )
  const delivery = (
    await sql(
      'select delivery_status,actual_delivery_time from public.deliveries where delivery_id=2',
    )
  ).rows[0]
  assert.equal(delivery.delivery_status, 'completed')
  assert.ok(delivery.actual_delivery_time)
  const order = (await sql('select order_status,delivery_date from public.orders where order_id=2'))
    .rows[0]
  assert.equal(order.order_status, 'delivered')
  assert.ok(order.delivery_date)
  const event = (
    await sql(
      "select previous_status,new_status,remarks from private.delivery_status_events where delivery_id=2 and idempotency_key='admin:complete-two'",
    )
  ).rows[0]
  assert.equal(event.previous_status, 'available')
  assert.equal(event.new_status, 'completed')
  assert.match(event.remarks, /test-admin@example.invalid/)
})
test('ordinary completion still requires rider delivery photo evidence', async () => {
  await sql(
    "insert into public.deliveries(delivery_id,order_id,delivery_status) overriding system value values(99,1,'arrived_at_delivery')",
  )
  await assert.rejects(
    () => sql("update public.deliveries set delivery_status='completed' where delivery_id=99"),
    /delivery evidence photo/,
  )
  await sql(
    "insert into public.delivery_proofs(delivery_id,proof_stage,proof_type,file_path,confirmed_at) values(99,'delivery','photo','rider/99/photo.jpg',now())",
  )
  await sql("update public.deliveries set delivery_status='completed' where delivery_id=99")
  assert.equal(
    (await sql('select delivery_status from public.deliveries where delivery_id=99')).rows[0]
      .delivery_status,
    'completed',
  )
  await sql('delete from public.delivery_proofs where delivery_id=99')
  await sql('delete from public.deliveries where delivery_id=99')
})
test('GPS validates fixes, ignores older positions, records trip history, and preserves own-rider RLS', async () => {
  const upsert = `insert into public.rider_locations values($1,$2,$3,10,$4) on conflict(rider_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,location_updated_at=excluded.location_updated_at`
  const now = new Date()
  await sql(upsert, [rider, 14.5, 121, new Date(now - 300000).toISOString()])
  assert.equal(
    (await sql('select count(*)::int n from private.delivery_location_history')).rows[0].n,
    0,
  )
  await sql(upsert, [rider, 14.65, 121.05, now.toISOString()])
  await sql(upsert, [rider, 14.5, 121.0, new Date(now - 1000).toISOString()])
  assert.equal((await sql('select latitude from public.rider_locations')).rows[0].latitude, 14.65)
  assert.equal(
    (await sql('select count(*)::int n from private.delivery_location_history')).rows[0].n,
    1,
  )
  await assert.rejects(() => sql(upsert, [rider, 100, 121, now.toISOString()]), /Invalid GPS/)
  await assert.rejects(
    () => sql(upsert, [rider, 14, 121, new Date(+now + 120000).toISOString()]),
    /Invalid GPS/,
  )
  await sql("select set_config('test.rider_id',$1,false)", [second])
  await db.exec('set role authenticated')
  await assert.rejects(
    () => sql(upsert, [rider, 14, 121, new Date(+now + 1000).toISOString()]),
    /row-level security/,
  )
  await assert.rejects(() => sql('select public.admin_delivery_rows()'), /permission denied/)
  await sql(upsert, [second, 14.7, 121.1, now.toISOString()])
  await db.exec('reset role')
})
test('list pagination and detail read actual assignments, GPS and evidence without confirmation hashes', async () => {
  const page = (await sql('select public.admin_delivery_rows(false,0,1) result')).rows[0].result
  assert.equal(page.total, 2)
  assert.equal(page.rows.length, 1)
  await sql(
    "insert into public.delivery_proofs(delivery_id,proof_stage,proof_type,confirmation_code_hash,confirmed_at) values(1,'delivery','confirmation_code','secret-hash',now())",
  )
  const details = (await sql('select public.admin_delivery_detail(1) result')).rows[0].result
  assert.equal(details.items[0].name, 'Tomatoes')
  assert.ok(details.events.length >= 3)
  assert.equal(details.history.length, 1)
  assert.equal('confirmation_code_hash' in details.proofs[0], false)
})
test('failure closes active tracking and rejects further writes', async () => {
  await save({
    action: 'status',
    delivery_id: 1,
    previous_status: 'going_to_pickup',
    status: 'failed',
    reason: 'Vehicle unavailable',
    command_id: 'fail-one',
  })
  const active = (await sql('select public.admin_delivery_rows(true) result')).rows[0].result
  assert.equal(
    active.rows.some((d) => d.delivery_id === 1),
    false,
  )
  const riders = (await sql('select public.admin_rider_tracking_rows() result')).rows[0].result
  assert.equal(riders.rows.find((r) => r.rider_id === rider).latitude, 14.65)
  assert.equal(riders.rows.find((r) => r.rider_id === second).latitude, 14.7)
  await assert.rejects(
    () =>
      save({
        action: 'status',
        delivery_id: 1,
        previous_status: 'failed',
        status: 'accepted',
        reason: 'retry',
        command_id: 'reopen-one',
      }),
    /already closed/,
  )
})
test('failed delivery can be reopened and edited through audited operations', async () => {
  const reopenBody = {
    action: 'reopen',
    delivery_id: 1,
    previous_status: 'failed',
    reason: 'Retry approved after vehicle replacement',
    command_id: 'retry-one',
  }
  const reopen = async () =>
    (
      await sql('select public.admin_reopen_delivery($1::jsonb,$2) result', [
        JSON.stringify(reopenBody),
        'test-admin@example.invalid',
      ])
    ).rows[0].result
  assert.equal((await reopen()).reopened, true)
  assert.equal((await reopen()).reopened, undefined)
  assert.equal(
    (await sql('select delivery_status from public.deliveries where delivery_id=1')).rows[0]
      .delivery_status,
    'available',
  )
  assert.equal(
    (await sql('select count(*)::int n from private.rider_delivery_assignments where delivery_id=1'))
      .rows[0].n,
    0,
  )

  const updateBody = {
    action: 'update',
    delivery_id: 1,
    previous_status: 'available',
    pickup_location: 'Updated Farm Gate',
    dropoff_location: 'Updated Market Stall',
    scheduled_at: '2026-12-03T09:30:00Z',
    reason: 'Customer confirmed a new schedule',
    command_id: 'edit-one',
  }
  const updated = (
    await sql('select public.admin_update_delivery($1::jsonb,$2) result', [
      JSON.stringify(updateBody),
      'test-admin@example.invalid',
    ])
  ).rows[0].result
  assert.equal(updated.updated, true)
  const delivery = (
    await sql(
      'select pickup_location,dropoff_location,estimated_delivery_time from public.deliveries where delivery_id=1',
    )
  ).rows[0]
  assert.equal(delivery.pickup_location, 'Updated Farm Gate')
  assert.equal(delivery.dropoff_location, 'Updated Market Stall')
  assert.equal(new Date(delivery.estimated_delivery_time).toISOString(), '2026-12-03T09:30:00.000Z')
})
test('admin deletion permanently removes the delivery and retains a tombstone audit', async () => {
  const body = {
    action: 'delete',
    delivery_id: 2,
    previous_status: 'completed',
    command_id: 'delete-two',
  }
  const remove = async () =>
    (
      await sql('select public.admin_delete_delivery($1::jsonb,$2) result', [
        JSON.stringify(body),
        'test-admin@example.invalid',
      ])
    ).rows[0].result
  assert.equal((await remove()).deleted, true)
  assert.equal((await remove()).deleted, true)
  assert.equal(
    (await sql('select count(*)::int n from public.deliveries where delivery_id=2')).rows[0].n,
    0,
  )
  const audit = (
    await sql(
      "select actor,deleted_delivery_id from private.admin_delivery_deletions where command_id='delete-two'",
    )
  ).rows[0]
  assert.equal(audit.actor, 'test-admin@example.invalid')
  assert.equal(audit.deleted_delivery_id, 2)
})
