import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('distributed rate-limit RPC atomically rejects requests over the allowance', async () => {
  const database = new PGlite()
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema private;
  `)
  const migration = await readFile(
    new URL('../../supabase/migrations/20260917110000_admin_distributed_rate_limits.sql', import.meta.url),
    'utf8',
  )
  await database.exec(migration)

  const consume = async (key) => {
    const result = await database.query(
      `select * from public.admin_consume_rate_limit(
        'auth:login:account', $1, 2, 900
      )`,
      [key],
    )
    return result.rows[0]
  }
  const key = 'a'.repeat(64)
  assert.equal((await consume(key)).allowed, true)
  assert.equal((await consume(key)).allowed, true)
  const rejected = await consume(key)
  assert.equal(rejected.allowed, false)
  assert.equal(rejected.remaining, 0)
  assert.ok(rejected.retry_after_seconds > 0)
  assert.equal((await consume('b'.repeat(64))).allowed, true)

  await database.close()
})
