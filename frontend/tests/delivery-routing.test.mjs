import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDeliveryRoutingUrl,
  normalizeDeliveryRoutingUrl,
} from '../src/config/deliveryRouting.ts'

test('routing stays disabled when no approved endpoint is configured', () => {
  assert.equal(normalizeDeliveryRoutingUrl(undefined, true), null)
  assert.equal(normalizeDeliveryRoutingUrl('', true), null)
  assert.equal(getDeliveryRoutingUrl(), null)
})

test('public demo, insecure production, and credential-bearing URLs are rejected', () => {
  assert.equal(normalizeDeliveryRoutingUrl('https://router.project-osrm.org', true), null)
  assert.equal(normalizeDeliveryRoutingUrl('https://router.project-osrm.org.', true), null)
  assert.equal(normalizeDeliveryRoutingUrl('http://routing.example.test', true), null)
  assert.equal(normalizeDeliveryRoutingUrl('https://user:secret@routing.example.test', true), null)
  assert.equal(normalizeDeliveryRoutingUrl('https://routing.example.test?token=secret', true), null)
})

test('approved HTTPS routing origins are normalized', () => {
  assert.equal(
    normalizeDeliveryRoutingUrl(' https://routing.example.test/osrm/ ', true),
    'https://routing.example.test/osrm',
  )
})
