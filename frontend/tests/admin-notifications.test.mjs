import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveMarketplaceNotifications } from '../src/pages/adminDashboard/adminNotificationEvents.ts'
import {
  mergeNotificationsWithState,
  loadStoredNotificationState,
  saveStoredNotificationState,
} from '../src/pages/adminDashboard/adminNotificationStorage.ts'
import { createMockDatabaseData } from './fixtures/notificationTestData.mjs'

test('deriveMarketplaceNotifications extracts events across all 6 domains', () => {
  const data = createMockDatabaseData()
  const events = deriveMarketplaceNotifications(data)

  // 1. New Orders
  const orderEvent = events.find((e) => e.id === 'order-#AG-1001')
  assert.ok(orderEvent, 'New order event should be generated')
  assert.match(orderEvent.title, /Order #AG-1001/i)
  assert.match(orderEvent.message, /Maria Santos/i)

  // 2. Pending Approvals (farmer & rider)
  const farmerEvent = events.find((e) => e.id === 'approval-farmer-farmer-001')
  assert.ok(farmerEvent, 'Farmer approval event should be generated')
  assert.match(farmerEvent.title, /Farmer approval pending/i)

  const riderEvent = events.find((e) => e.id === 'approval-rider-rider-001')
  assert.ok(riderEvent, 'Rider approval event should be generated')
  assert.match(riderEvent.title, /Rider verification pending/i)

  // 3. Failed Payments
  const paymentEvent = events.find((e) => e.id === 'payment-failed-PAY-404')
  assert.ok(paymentEvent, 'Failed payment event should be generated')
  assert.match(paymentEvent.title, /Payment failed/i)
  assert.match(paymentEvent.message, /PAY-404/i)

  // 4. Delivery Exceptions
  const deliveryEvent = events.find((e) => e.id === 'delivery-exception-del-999')
  assert.ok(deliveryEvent, 'Delivery exception event should be generated')
  assert.match(deliveryEvent.title, /Delivery exception: Failed/i)

  // 5. Low Stock
  const lowStockSummary = events.find((e) => e.id === 'inventory-low-stock-summary')
  assert.ok(lowStockSummary, 'Low stock summary event should be generated')
  assert.match(lowStockSummary.message, /3 commodities require replenishment/i)

  const lowStockItem = events.find((e) => e.id === 'inventory-item-carabao-mangoes')
  assert.ok(lowStockItem, 'Low stock individual commodity event should be generated')

  // 6. Complaints & Reports
  const complaintEvent = events.find((e) => e.id === 'complaint-review-rev-301')
  assert.ok(complaintEvent, 'Complaint / reported review event should be generated')
  assert.match(complaintEvent.message, /Fruit arrived bruised and late/i)
})

test('mergeNotificationsWithState respects read and dismissed IDs', () => {
  const data = createMockDatabaseData()
  const events = deriveMarketplaceNotifications(data)

  const storedState = {
    customNotifications: [
      {
        id: 'custom-1',
        message: 'Platform maintenance completed',
        read: false,
        time: 'Just now',
        title: 'System notice',
      },
    ],
    dismissedIds: ['payment-failed-PAY-404'],
    readIds: ['order-#AG-1001'],
  }

  const merged = mergeNotificationsWithState(events, storedState)

  // Custom notification should appear first
  assert.equal(merged[0].id, 'custom-1')

  // Read event should have read: true
  const orderEvent = merged.find((e) => e.id === 'order-#AG-1001')
  assert.ok(orderEvent)
  assert.equal(orderEvent.read, true)

  // Dismissed event should be completely excluded
  const paymentEvent = merged.find((e) => e.id === 'payment-failed-PAY-404')
  assert.equal(paymentEvent, undefined)
})

test('localStorage persistence retains notifications and state across simulated refresh', () => {
  const storageMap = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => storageMap.get(key) ?? null,
      setItem: (key, val) => storageMap.set(key, val),
    },
  }

  const adminEmail = 'admin@agrisell.ph'

  // Session 1: save a state
  const session1State = {
    customNotifications: [
      {
        id: 'session1-note',
        message: 'Farmer Highland Farm approved.',
        read: false,
        time: 'Just now',
        title: 'Action performed',
      },
    ],
    dismissedIds: ['delivery-exception-del-999'],
    readIds: ['inventory-low-stock-summary'],
  }
  saveStoredNotificationState(adminEmail, session1State)

  // Session 2: simulated refresh - load state back
  const loadedState = loadStoredNotificationState(adminEmail)
  assert.deepEqual(loadedState.dismissedIds, ['delivery-exception-del-999'])
  assert.deepEqual(loadedState.readIds, ['inventory-low-stock-summary'])
  assert.equal(loadedState.customNotifications.length, 1)
  assert.equal(loadedState.customNotifications[0].title, 'Action performed')

  // When merged on refresh with newly fetched database data:
  const data = createMockDatabaseData()
  const events = deriveMarketplaceNotifications(data)
  const mergedOnRefresh = mergeNotificationsWithState(events, loadedState)

  // Dismissed delivery exception must NOT appear
  assert.equal(
    mergedOnRefresh.some((n) => n.id === 'delivery-exception-del-999'),
    false,
  )
  // Low stock summary must be marked as read
  const lowStock = mergedOnRefresh.find((n) => n.id === 'inventory-low-stock-summary')
  assert.ok(lowStock)
  assert.equal(lowStock.read, true)
  // Session note must still be present
  assert.ok(mergedOnRefresh.some((n) => n.id === 'session1-note'))
})
