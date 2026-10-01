import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  computeFarmsBoundingBox,
  computeFarmStats,
  computeParcelGeofence,
  formatCoordinates,
  isValidCoordinate,
} = await import(
  '../src/components/ui/farmerFarmDrilldown/farmParcelMap.utils.ts'
)

test('isValidCoordinate validates latitude and longitude boundaries', () => {
  assert.equal(isValidCoordinate(14.5995, 120.9842), true)
  assert.equal(isValidCoordinate(-7.1234, 110.5678), true)
  assert.equal(isValidCoordinate(0, 0), false) // (0, 0) is null island placeholder
  assert.equal(isValidCoordinate(95, 120), false) // out of lat range
  assert.equal(isValidCoordinate(14, 200), false) // out of long range
  assert.equal(isValidCoordinate(NaN, 120), false)
})

test('computeParcelGeofence creates a valid closed polygonal ring', () => {
  const ring = computeParcelGeofence(14.5995, 120.9842, 5, 32)
  assert.ok(Array.isArray(ring))
  assert.equal(ring.length, 33) // 32 points + 1 closing point

  // Check that the polygon is closed (first point equals last point)
  const [firstLng, firstLat] = ring[0]
  const [lastLng, lastLat] = ring[ring.length - 1]
  assert.ok(Math.abs(firstLng - lastLng) < 1e-6)
  assert.ok(Math.abs(firstLat - lastLat) < 1e-6)

  // Verify points surround the center
  for (const [lng, lat] of ring) {
    assert.ok(Math.abs(lat - 14.5995) < 0.05)
    assert.ok(Math.abs(lng - 120.9842) < 0.05)
  }
})

test('computeFarmsBoundingBox calculates proper bounds for multiple parcels', () => {
  const mockFarms = [
    { gpsLat: 14.5, gpsLong: 121.0, farmSizeHectares: 2 },
    { gpsLat: 14.8, gpsLong: 121.3, farmSizeHectares: 5 },
    { gpsLat: 14.2, gpsLong: 120.8, farmSizeHectares: 1 },
  ]

  const bbox = computeFarmsBoundingBox(mockFarms)
  assert.ok(bbox)
  assert.deepEqual(bbox, [120.8, 14.2, 121.3, 14.8])
})

test('computeFarmStats aggregates acreage, crop counts, and geocoding ratio', () => {
  const mockFarms = [
    {
      gpsLat: 14.5,
      gpsLong: 121.0,
      farmSizeHectares: 2.5,
      mainCrops: ['Rice', 'Corn'],
    },
    {
      gpsLat: 14.8,
      gpsLong: 121.3,
      farmSizeHectares: 3.5,
      mainCrops: ['Corn', 'Tomato', 'Eggplant'],
    },
    {
      gpsLat: 0,
      gpsLong: 0,
      farmSizeHectares: 1.0,
      mainCrops: ['Banana'],
    },
  ]

  const stats = computeFarmStats(mockFarms)
  assert.equal(stats.totalFarms, 3)
  assert.equal(stats.totalHectares, 7.0)
  assert.equal(stats.validGpsCount, 2)
  assert.equal(stats.uniqueCropsCount, 5) // rice, corn, tomato, eggplant, banana
})

test('formatCoordinates formats direction and degree values cleanly', () => {
  assert.equal(formatCoordinates(14.5995, 120.9842), '14.5995° N, 120.9842° E')
  assert.equal(formatCoordinates(-12.3456, -77.1234), '12.3456° S, 77.1234° W')
  assert.equal(formatCoordinates(0, 0), 'Coordinates not set')
})
