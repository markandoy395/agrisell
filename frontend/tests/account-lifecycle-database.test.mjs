import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL(
  '../../supabase/migrations/20260915100000_admin_account_lifecycle.sql',
  import.meta.url,
)

test('account lifecycle migration enforces reasons and keeps an audit trail', async () => {
  const database = new PGlite()
  await database.exec('create role anon; create role authenticated;')
  await database.exec(await readFile(migrationUrl, 'utf8'))
  await database.query(`insert into public.admin_account_lifecycle_events
    (account_type, account_id, action, actor_email, reason)
    values ('user', '42', 'suspended', 'admin@example.com', 'Repeated policy violations')`)
  await database.query(`insert into public.admin_verification_actions
    (entity_type, entity_id, action, actor_email, message, missing_items)
    values ('rider', 'abc', 'needs_information', 'admin@example.com', 'Upload the missing file', array['Identity document'])`)

  const events = await database.query(
    'select action, reason from public.admin_account_lifecycle_events',
  )
  assert.deepEqual(events.rows, [{ action: 'suspended', reason: 'Repeated policy violations' }])
  await assert.rejects(
    database.query(`insert into public.admin_verification_actions
      (entity_type, entity_id, action, actor_email)
      values ('farmer', '9', 'rejected', 'admin@example.com')`),
  )
  await assert.rejects(
    database.query(`insert into public.admin_verification_actions
      (entity_type, entity_id, action, actor_email, message)
      values ('farmer', '9', 'needs_information', 'admin@example.com', 'More details')`),
  )
  await database.close()
})
