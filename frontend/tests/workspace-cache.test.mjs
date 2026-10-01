import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceCache } from '../src/utils/workspaceCache.ts'

test('workspace cache starts empty and stores data on set', () => {
  const cache = createWorkspaceCache()
  assert.equal(cache.get(), null)
  assert.equal(cache.hasData(), false)

  cache.set({ count: 42, items: ['apple', 'orange'] })
  assert.equal(cache.hasData(), true)
  assert.deepEqual(cache.get(), { count: 42, items: ['apple', 'orange'] })

  cache.clear()
  assert.equal(cache.get(), null)
  assert.equal(cache.hasData(), false)
})

test('fetchCached returns cached data without calling fetcher when cached', async () => {
  let callCount = 0
  const fetcher = async () => {
    callCount++
    return ['item1', 'item2']
  }

  const cache = createWorkspaceCache(fetcher)
  const first = await cache.fetchCached()
  assert.equal(callCount, 1)
  assert.deepEqual(first, ['item1', 'item2'])

  // Subsequent call without forceRefresh returns cached data immediately
  const second = await cache.fetchCached()
  assert.equal(callCount, 1)
  assert.deepEqual(second, ['item1', 'item2'])

  // Call with forceRefresh = true calls fetcher again
  const refreshed = await cache.fetchCached(undefined, undefined, true)
  assert.equal(callCount, 2)
  assert.deepEqual(refreshed, ['item1', 'item2'])
})

test('fetchCached deduplicates concurrent in-flight requests', async () => {
  let callCount = 0
  const fetcher = async () => {
    callCount++
    await new Promise((r) => setTimeout(r, 20))
    return { data: 'test-result' }
  }

  const cache = createWorkspaceCache(fetcher)
  const [res1, res2, res3] = await Promise.all([
    cache.fetchCached(),
    cache.fetchCached(),
    cache.fetchCached(),
  ])

  assert.equal(callCount, 1, 'In-flight calls must be deduplicated into 1 request')
  assert.deepEqual(res1, { data: 'test-result' })
  assert.deepEqual(res2, { data: 'test-result' })
  assert.deepEqual(res3, { data: 'test-result' })
})

test('preload triggers background fetch and warms cache', async () => {
  let callCount = 0
  const fetcher = async () => {
    callCount++
    await new Promise((r) => setTimeout(r, 10))
    return ['cat-A', 'cat-B']
  }

  const cache = createWorkspaceCache(fetcher)
  cache.preload()
  assert.equal(callCount, 1)

  // Calling preload again while in-flight or cached does not trigger another call
  cache.preload()
  assert.equal(callCount, 1)

  const result = await cache.fetchCached()
  assert.equal(callCount, 1)
  assert.deepEqual(result, ['cat-A', 'cat-B'])
})

test('subscribe notifies listeners when cache changes', () => {
  const cache = createWorkspaceCache()
  const updates = []
  const unsubscribe = cache.subscribe((data) => {
    updates.push(data)
  })

  cache.set('first')
  cache.set('second')
  cache.clear()
  unsubscribe()
  cache.set('third')

  assert.deepEqual(updates, ['first', 'second', null])
})
