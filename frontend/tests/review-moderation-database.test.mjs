import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

let db
const moderate = async ({ type = 'farmer', id = '1', action, flag = null, note = null }) =>
  (
    await db.query('select public.admin_moderate_review($1,$2,$3,$4,$5,$6) result', [
      type,
      id,
      action,
      'moderator@example.test',
      flag,
      note,
    ])
  ).rows[0].result

before(async () => {
  db = new PGlite()
  await db.exec(
    await readFile(new URL('fixtures/review-moderation-schema.sql', import.meta.url), 'utf8'),
  )
  const migration = await readFile(
    new URL(
      '../../supabase/migrations/20260915110000_complete_review_moderation.sql',
      import.meta.url,
    ),
    'utf8',
  )
  await db.exec(migration)
  await db.exec(migration)
})

after(async () => db?.close())

test('hide and republish persist state and attributed history', async () => {
  const hidden = await moderate({ action: 'hide', note: 'Contains personal details' })
  assert.equal(hidden.moderation.visibility_status, 'hidden')
  assert.equal(hidden.event.action, 'hidden')
  assert.equal(hidden.event.created_by_email, 'moderator@example.test')

  const published = await moderate({ action: 'publish', note: 'Details removed by reviewer' })
  assert.equal(published.moderation.visibility_status, 'published')
  const events = await db.query(
    "select action from public.admin_review_moderation_events where review_type='farmer' and review_id='1' order by event_id",
  )
  assert.deepEqual(
    events.rows.map(({ action }) => action),
    ['hidden', 'published'],
  )
})

test('report decisions and abuse flags are durable and auditable', async () => {
  await moderate({ type: 'rider', id: '2', action: 'reopen_report' })
  const resolved = await moderate({
    type: 'rider',
    id: '2',
    action: 'resolve_report',
    note: 'Evidence reviewed',
  })
  assert.equal(resolved.moderation.report_status, 'resolved')

  const flagged = await moderate({
    type: 'rider',
    id: '2',
    action: 'add_abuse_flag',
    flag: 'harassment',
  })
  assert.deepEqual(flagged.moderation.abuse_flags, ['harassment'])
  const cleared = await moderate({
    type: 'rider',
    id: '2',
    action: 'remove_abuse_flag',
    flag: 'harassment',
  })
  assert.deepEqual(cleared.moderation.abuse_flags, [])
})

test('invalid flags and unknown reviews are rejected without history', async () => {
  await assert.rejects(
    () => moderate({ action: 'add_abuse_flag', flag: 'anything' }),
    /valid abuse flag/i,
  )
  await assert.rejects(() => moderate({ id: '404', action: 'hide' }), /Review not found/i)
})

test('hidden reviews leave the marketplace and direct messages never leak publicly', async () => {
  await db.query(
    "insert into public.admin_review_responses(review_type,review_id,response_mode,message) values ('farmer','1','direct','private text'),('farmer','1','public','Thanks for your feedback')",
  )
  const published = (await db.query('select public.marketplace_product_reviews(50) result')).rows[0]
    .result
  assert.equal(Number(published.reviewCount), 1)
  assert.equal(published.reviews[0].adminResponse, 'Thanks for your feedback')
  assert.doesNotMatch(JSON.stringify(published), /private text/)

  await moderate({ action: 'hide' })
  const hidden = (await db.query('select public.marketplace_product_reviews(50) result')).rows[0]
    .result
  assert.equal(Number(hidden.reviewCount), 0)
  assert.deepEqual(hidden.reviews, [])
})
