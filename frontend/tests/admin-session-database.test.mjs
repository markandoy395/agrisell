import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('administrator session versions persist and increment atomically', async () => {
  const database = new PGlite()
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.users (
      user_id bigint primary key,
      email text not null
    );
    create table public.admins (
      user_id bigint primary key references public.users(user_id),
      admin_role text not null
    );
    insert into public.users values (1, 'admin@example.com');
    insert into public.admins values (1, 'admin');
  `)
  const migration = await readFile(
    new URL('../../supabase/migrations/20260917120000_admin_persistent_sessions.sql', import.meta.url),
    'utf8',
  )
  await database.exec(migration)
  await database.exec(`
    insert into public.admin_sessions (
      session_id, admin_email, admin_user_id, session_version, issued_at, expires_at
    ) values (
      '11111111-1111-4111-8111-111111111111',
      'admin@example.com',
      '1',
      1,
      now(),
      now() + interval '1 hour'
    );
  `)

  const incremented = await database.query(
    "select public.admin_increment_session_version('ADMIN@example.com') as version",
  )
  assert.equal(incremented.rows[0].version, 2)
  const stored = await database.query(
    'select session_version, revoked_at from public.admin_sessions',
  )
  assert.equal(stored.rows[0].session_version, 1)
  assert.equal(stored.rows[0].revoked_at, null)

  const invalidated = await database.query(
    "select * from public.admin_invalidate_sessions('admin@example.com')",
  )
  assert.equal(invalidated.rows[0].session_version, 3)
  assert.equal(invalidated.rows[0].revoked_sessions, 1)
  const revoked = await database.query(
    'select revoked_at is not null as revoked from public.admin_sessions',
  )
  assert.equal(revoked.rows[0].revoked, true)

  await database.close()
})
