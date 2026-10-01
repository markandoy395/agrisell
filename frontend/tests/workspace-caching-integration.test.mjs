import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearCommodityCache,
  fetchCommoditiesCached,
  getCommodityCache,
  preloadCommodities,
  setCommodityCache,
} from '../src/pages/commodityWorkspace/commodityCache.ts'
import {
  clearCategoryCache,
  fetchCategoriesCached,
  getCategoryCache,
  preloadCategories,
  setCategoryCache,
} from '../src/pages/categoryWorkspace/categoryCache.ts'
import {
  clearSafetyCache,
  fetchSafetyCached,
  getSafetyCache,
  preloadSafetyIncidents,
  setSafetyCache,
} from '../src/pages/safetyWorkspace/safetyCache.ts'

test('commodity cache holds data and initializes without loading state on tab navigation', () => {
  clearCommodityCache()
  assert.equal(getCommodityCache(), null)
  const coldLoading = getCommodityCache() === null
  assert.equal(coldLoading, true, 'Cold start without cache must indicate loading')

  const mockData = {
    categories: ['Vegetables', 'Fruits'],
    commodities: [
      {
        commodityId: 'comm-1',
        name: 'Highland Carrots',
        categoryName: 'Vegetables',
        price: 85,
        status: 'available',
        availableQuantity: 500,
        farmName: 'Benguet Green Farm',
        farmerName: 'Mario',
        productionStatus: 'harvested',
        batches: [],
      },
    ],
    farms: [],
  }

  setCommodityCache(mockData)

  const cached = getCommodityCache()
  assert.ok(cached !== null)
  const warmLoading = cached === null
  assert.equal(warmLoading, false, 'Remounting or navigating with cached commodities must NOT show loading state')
  assert.equal(cached.commodities.length, 1)
  assert.equal(cached.commodities[0].commodityId, 'comm-1')
})

test('category cache holds data and initializes without loading state on tab navigation', () => {
  clearCategoryCache()
  assert.equal(getCategoryCache(), null)
  const coldLoading = getCategoryCache() === null
  assert.equal(coldLoading, true, 'Cold start without cache must indicate loading')

  const mockCategories = {
    categories: [
      {
        id: 'cat-1',
        categoryName: 'Root Vegetables',
        status: 'active',
        commodityCount: 12,
        displayOrder: 1,
      },
    ],
  }

  setCategoryCache(mockCategories)

  const cached = getCategoryCache()
  assert.ok(cached !== null)
  const warmLoading = cached === null
  assert.equal(warmLoading, false, 'Remounting or navigating with cached categories must NOT show loading state')
  assert.equal(cached.categories.length, 1)
  assert.equal(cached.categories[0].categoryName, 'Root Vegetables')
})

test('safety cache holds data and initializes without loading state on tab navigation', () => {
  clearSafetyCache()
  assert.equal(getSafetyCache(), null)
  const coldLoading = getSafetyCache() === null
  assert.equal(coldLoading, true, 'Cold start without cache must indicate loading')

  const mockSafety = {
    incidents: [
      {
        report_id: 'inc-1',
        incident_type: 'accident',
        status: 'open',
        description: 'Minor breakdown near station',
        created_at: new Date().toISOString(),
        rider_name: 'Alex Rider',
      },
    ],
    summary: {
      total_incidents: 1,
      open_emergencies: 0,
      active_accidents: 1,
      under_review: 0,
      resolved: 0,
    },
  }

  setSafetyCache(mockSafety)

  const cached = getSafetyCache()
  assert.ok(cached !== null)
  const warmLoading = cached === null
  assert.equal(warmLoading, false, 'Remounting or navigating with cached safety incidents must NOT show loading state')
  assert.equal(cached.incidents.length, 1)
  assert.equal(cached.summary.total_incidents, 1)
})

test('concurrent preloading and cached fetching deduplicate calls for all workspaces', async () => {
  clearCommodityCache()
  clearCategoryCache()
  clearSafetyCache()

  let commCalls = 0
  let catCalls = 0
  let safetyCalls = 0

  const mockCommFetcher = async () => {
    commCalls++
    await new Promise((r) => setTimeout(r, 10))
    return { categories: ['Grains'], commodities: [], farms: [] }
  }

  const mockCatFetcher = async () => {
    catCalls++
    await new Promise((r) => setTimeout(r, 10))
    return { categories: [] }
  }

  const mockSafetyFetcher = async () => {
    safetyCalls++
    await new Promise((r) => setTimeout(r, 10))
    return { incidents: [], summary: { total_incidents: 0, open_emergencies: 0, active_accidents: 0, under_review: 0, resolved: 0 } }
  }

  preloadCommodities(mockCommFetcher)
  preloadCategories(mockCatFetcher)
  preloadSafetyIncidents(mockSafetyFetcher)

  await Promise.all([
    fetchCommoditiesCached(undefined, mockCommFetcher),
    fetchCategoriesCached(undefined, mockCatFetcher),
    fetchSafetyCached(undefined, mockSafetyFetcher),
  ])

  assert.equal(commCalls, 1, 'Commodities concurrent calls deduplicated')
  assert.equal(catCalls, 1, 'Categories concurrent calls deduplicated')
  assert.equal(safetyCalls, 1, 'Safety concurrent calls deduplicated')
})
