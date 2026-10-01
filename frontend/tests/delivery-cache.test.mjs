import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearDeliveryCache,
  fetchDeliveriesCached,
  getDeliveryCache,
  preloadDeliveries,
  setDeliveryCache,
} from '../src/pages/deliveryWorkspace/deliveryCache.ts'

test('delivery cache starts empty after clear and holds data on set', () => {
  clearDeliveryCache()
  assert.equal(getDeliveryCache().deliveries, null)
  assert.equal(getDeliveryCache().options, null)

  const mockDeliveries = [
    {
      delivery_id: 101,
      order_id: 201,
      customer_name: 'Juan Dela Cruz',
      delivery_status: 'pending',
      pickup_location: 'Farm A',
      dropoff_location: 'City B',
    },
  ]
  const mockOptions = {
    riders: [
      {
        rider_id: 'R-1',
        full_name: 'Rider One',
        availability_status: 'available',
        active_deliveries: 0,
        maximum_active_deliveries: 3,
        vehicle_type: 'Motorcycle',
      },
    ],
    orders: [{ order_id: 201, customer_name: 'Juan Dela Cruz', destination: 'City B' }],
  }

  setDeliveryCache(mockDeliveries, mockOptions)

  const cache = getDeliveryCache()
  assert.equal(cache.deliveries?.length, 1)
  assert.equal(cache.deliveries?.[0].delivery_id, 101)
  assert.equal(cache.options?.riders.length, 1)
})

test('navigation to deliveries with cached data initializes without loading state', () => {
  const mockDeliveries = [
    {
      delivery_id: 505,
      order_id: 606,
      customer_name: 'Maria Santos',
      delivery_status: 'in_transit',
    },
  ]
  setDeliveryCache(mockDeliveries)

  const cache = getDeliveryCache()
  const initialLoading = cache.deliveries === null
  assert.equal(initialLoading, false, 'Loading state must be false when cache is populated')
  assert.equal(cache.deliveries?.length, 1)
  assert.equal(cache.deliveries?.[0].delivery_id, 505)

  clearDeliveryCache()
  const coldLoading = getDeliveryCache().deliveries === null
  assert.equal(coldLoading, true, 'Loading state must be true on a cold start without cache')
})

test('cache retains data across simulated tab switching', () => {
  const deliveries = [
    { delivery_id: 1, order_id: 10, delivery_status: 'delivered' },
    { delivery_id: 2, order_id: 11, delivery_status: 'assigned' },
  ]
  setDeliveryCache(deliveries)

  const afterUnmountCache = getDeliveryCache()
  assert.ok(afterUnmountCache.deliveries, 'Cache must not be wiped when unmounting')
  assert.equal(afterUnmountCache.deliveries?.length, 2)

  const remountLoading = afterUnmountCache.deliveries === null
  assert.equal(remountLoading, false, 'Remounting must not show loading state')
  assert.deepEqual(afterUnmountCache.deliveries, deliveries)
})

test('preloadDeliveries and fetchDeliveriesCached deduplicate concurrent calls and populate cache', async () => {
  clearDeliveryCache()
  let callCount = 0
  const mockFetcher = async () => {
    callCount++
    await new Promise((resolve) => setTimeout(resolve, 10))
    return [
      [{ delivery_id: 777, order_id: 888, delivery_status: 'pending' }],
      { riders: [], orders: [] },
    ]
  }

  // Preload triggers fetch in background
  preloadDeliveries(mockFetcher)
  // Concurrent call should reuse the same in-flight promise
  const [deliveries, options] = await fetchDeliveriesCached(undefined, mockFetcher)

  assert.equal(callCount, 1, 'Simultaneous requests must be deduplicated')
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0].delivery_id, 777)
  assert.deepEqual(getDeliveryCache().deliveries, deliveries)
  assert.deepEqual(getDeliveryCache().options, options)
})
