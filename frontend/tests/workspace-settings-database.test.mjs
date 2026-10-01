import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationUrl = new URL(
  '../../supabase/migrations/20260914100000_persist_admin_workspace_actions.sql',
  import.meta.url,
)

test('workspace settings are private, typed, and isolated per administrator', async () => {
  const database = new PGlite()
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.farmers (farmer_user_id bigint primary key);
  `)
  await database.exec(await readFile(migrationUrl, 'utf8'))

  await database.query(`insert into public.admin_workspace_preferences
    (admin_email, auto_approve_verified_listings, daily_admin_digest)
    values ('first@example.invalid', false, true), ('second@example.invalid', true, false)`)

  const preferences = await database.query(`select admin_email,
    auto_approve_verified_listings, daily_admin_digest
    from public.admin_workspace_preferences order by admin_email`)
  assert.deepEqual(preferences.rows, [
    {
      admin_email: 'first@example.invalid',
      auto_approve_verified_listings: false,
      daily_admin_digest: true,
    },
    {
      admin_email: 'second@example.invalid',
      auto_approve_verified_listings: true,
      daily_admin_digest: false,
    },
  ])

  await assert.rejects(
    database.query(`insert into public.admin_workspace_preferences
      (admin_email) values ('first@example.invalid')`),
  )
  await database.exec('set role authenticated')
  await assert.rejects(
    database.query('select * from public.admin_workspace_preferences'),
    /permission denied/,
  )
  await database.close()
})
