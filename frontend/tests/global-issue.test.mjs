import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveActiveGlobalIssue } from '../src/pages/adminDashboard/useGlobalIssues.ts'

test('resolveActiveGlobalIssue returns null when no issues exist', () => {
  const issue = resolveActiveGlobalIssue({}, '', async () => {}, {})
  assert.equal(issue, null)
})

test('resolveActiveGlobalIssue bubbles up database error with retry action', () => {
  let refreshed = false
  const onRefresh = async () => {
    refreshed = true
  }

  const issue = resolveActiveGlobalIssue(
    {},
    'Failed to fetch marketplace data',
    onRefresh,
    {},
  )

  assert.ok(issue, 'Global issue must be generated for database error')
  assert.equal(issue.level, 'error')
  assert.equal(issue.category, 'Marketplace')
  assert.equal(issue.title, 'Marketplace Data Sync Interrupted')
  assert.equal(issue.message, 'Failed to fetch marketplace data')
  assert.equal(issue.actionLabel, 'Retry Sync')

  // Action executes retry
  issue.onAction()
  assert.equal(refreshed, true, 'Retry action must trigger onRefresh')
})

test('resolveActiveGlobalIssue prioritizes workspace-reported issues over database errors', () => {
  let retriedDelivery = false
  const reported = {
    Deliveries: {
      actionLabel: 'Reload Deliveries',
      category: 'Delivery',
      level: 'error',
      message: 'Could not load deliveries.',
      onAction: () => {
        retriedDelivery = true
      },
      title: 'Delivery Synchronization Issue',
    },
  }

  const issue = resolveActiveGlobalIssue(
    reported,
    'Generic background sync error',
    async () => {},
    {},
  )

  assert.ok(issue)
  assert.equal(issue.category, 'Delivery')
  assert.equal(issue.title, 'Delivery Synchronization Issue')
  assert.equal(issue.message, 'Could not load deliveries.')
  assert.equal(issue.actionLabel, 'Reload Deliveries')

  issue.onAction()
  assert.equal(retriedDelivery, true)
})

test('resolveActiveGlobalIssue honors dismissed issues', () => {
  const reported = {
    Deliveries: {
      actionLabel: 'Reload',
      category: 'Delivery',
      level: 'error',
      message: 'Connection timed out',
      title: 'Delivery Sync Failure',
    },
  }
  const id = 'Deliveries-Delivery Sync Failure'

  // When not dismissed
  const activeIssue = resolveActiveGlobalIssue(reported, '', async () => {}, {})
  assert.ok(activeIssue)
  assert.equal(activeIssue.id, id)

  // When marked as dismissed
  const dismissedIssue = resolveActiveGlobalIssue(reported, '', async () => {}, { [id]: true })
  assert.equal(dismissedIssue, null, 'Dismissed issue should not be returned')
})

test('clearing a reported workspace issue resets resolution', () => {
  const reported = {
    Deliveries: null,
  }

  const issue = resolveActiveGlobalIssue(reported, '', async () => {}, {})
  assert.equal(issue, null)
})

test('retry sync properly executes async retry and resolves the issue', async () => {
  let syncCompleted = false
  let dbError = 'Connection dropped'

  const onRefresh = async () => {
    await new Promise((r) => setTimeout(r, 15))
    syncCompleted = true
    dbError = ''
  }

  const issue = resolveActiveGlobalIssue({}, dbError, onRefresh, {})
  assert.ok(issue)
  assert.equal(issue.actionLabel, 'Retry Sync')

  await issue.onAction()
  assert.equal(syncCompleted, true, 'Retry action must complete')

  const resolved = resolveActiveGlobalIssue({}, dbError, onRefresh, {})
  assert.equal(resolved, null, 'Global issue must clear after successful retry sync')
})

test('workspace retry properly awaits async refresh and clears reported issue', async () => {
  let refreshedDeliveries = false
  let deliveryError = 'Could not load deliveries.'

  const reported = {
    Deliveries: {
      actionLabel: 'Reload Deliveries',
      category: 'Delivery',
      level: 'error',
      message: deliveryError,
      onAction: async () => {
        await new Promise((r) => setTimeout(r, 15))
        refreshedDeliveries = true
        deliveryError = ''
      },
      title: 'Delivery Synchronization Issue',
    },
  }

  const issue = resolveActiveGlobalIssue(reported, '', async () => {}, {})
  assert.ok(issue)
  assert.equal(issue.actionLabel, 'Reload Deliveries')

  await issue.onAction()
  assert.equal(refreshedDeliveries, true)

  reported.Deliveries = null
  const resolved = resolveActiveGlobalIssue(reported, '', async () => {}, {})
  assert.equal(resolved, null)
})
