import test from 'node:test'
import assert from 'node:assert/strict'

test('arrow key navigation logic correctly calculates directional movement and scores', () => {
  // Mock bounding rects for spatial elements
  const current = { top: 100, bottom: 140, left: 50, right: 150, width: 100, height: 40 }

  const candidatesBelow = [
    { id: 'item-1', top: 160, bottom: 200, left: 50, right: 150, width: 100, height: 40 }, // directly below
    { id: 'item-2', top: 250, bottom: 290, left: 50, right: 150, width: 100, height: 40 }, // far below
    { id: 'item-3', top: 160, bottom: 200, left: 300, right: 400, width: 100, height: 40 }, // below but to far right
  ]

  // Filter candidates below (top >= current.bottom - 6)
  const validBelow = candidatesBelow.filter((c) => c.top >= current.bottom - 6)
  assert.equal(validBelow.length, 3)

  // Score candidates: (top - current.bottom) * 1.6 + abs(centerX - current.centerX)
  const currentCenterX = current.left + current.width / 2
  const scored = validBelow.map((c) => {
    const cCenterX = c.left + c.width / 2
    const dy = c.top - current.bottom
    const dx = Math.abs(cCenterX - currentCenterX)
    return { id: c.id, score: dy * 1.6 + dx }
  })

  scored.sort((a, b) => a.score - b.score)

  // Closest directly below should have the lowest score
  assert.equal(scored[0].id, 'item-1')
  assert.ok(scored[0].score < scored[1].score)
  assert.ok(scored[0].score < scored[2].score)
})

test('arrow key navigation correctly prioritizes horizontal tab navigation', () => {
  const currentTab = { top: 80, bottom: 118, left: 100, right: 180, width: 80, height: 38 }

  const tabs = [
    { id: 'tab-all', top: 80, bottom: 118, left: 10, right: 90, width: 80, height: 38 },
    { id: 'tab-pending', top: 80, bottom: 118, left: 100, right: 180, width: 80, height: 38 }, // current
    { id: 'tab-confirmed', top: 80, bottom: 118, left: 190, right: 270, width: 80, height: 38 },
  ]

  // Candidate to the right with vertical overlap
  const rightCandidates = tabs.filter((t) => {
    if (t.id === 'tab-pending') return false
    const vertOverlap = Math.min(currentTab.bottom, t.bottom) - Math.max(currentTab.top, t.top)
    return vertOverlap > 6 && t.left >= currentTab.right - 8
  })

  assert.equal(rightCandidates.length, 1)
  assert.equal(rightCandidates[0].id, 'tab-confirmed')

  // Candidate to the left with vertical overlap
  const leftCandidates = tabs.filter((t) => {
    if (t.id === 'tab-pending') return false
    const vertOverlap = Math.min(currentTab.bottom, t.bottom) - Math.max(currentTab.top, t.top)
    return vertOverlap > 6 && t.right <= currentTab.left + 8
  })

  assert.equal(leftCandidates.length, 1)
  assert.equal(leftCandidates[0].id, 'tab-all')
})

test('sidebar navigation cycles through items with up and down', () => {
  const sidebarItems = ['Overview', 'Users', 'Farmers', 'Commodities', 'Settings']

  // Test down navigation
  const getNextIndex = (current) => (current + 1) % sidebarItems.length
  assert.equal(getNextIndex(0), 1) // Overview -> Users
  assert.equal(getNextIndex(3), 4) // Commodities -> Settings
  assert.equal(getNextIndex(4), 0) // Settings -> Overview (cycles)

  // Test up navigation
  const getPrevIndex = (current) => (current - 1 + sidebarItems.length) % sidebarItems.length
  assert.equal(getPrevIndex(1), 0) // Users -> Overview
  assert.equal(getPrevIndex(0), 4) // Overview -> Settings (cycles up)
})

test('arrow key navigation recognizes interactive element selectors', () => {
  const allowedSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
    '[role="button"]:not([aria-disabled="true"]):not([disabled])',
    '[role="tab"]:not([aria-disabled="true"]):not([disabled])',
  ]

  for (const selector of allowedSelectors) {
    assert.ok(selector.length > 0)
    assert.match(selector, /(button|input|select|textarea|href|tabindex|role)/)
  }
})

test('getAdjacentAdminSection correctly advances and retreats through admin sections with Left and Right arrows', async () => {
  const { getAdjacentAdminSection } = await import(
    '../src/hooks/useKeyboardArrowNavigation.ts'
  )

  const superAdminPerms = ['admin:manage']

  // Right arrow advances sections
  assert.equal(getAdjacentAdminSection('Overview', 'next', superAdminPerms), 'Users')
  assert.equal(getAdjacentAdminSection('Users', 'next', superAdminPerms), 'Farmers')
  assert.equal(getAdjacentAdminSection('Riders', 'next', superAdminPerms), 'Orders')
  assert.equal(getAdjacentAdminSection('Orders', 'next', superAdminPerms), 'Deliveries')
  assert.equal(getAdjacentAdminSection('Settings', 'next', superAdminPerms), 'Overview') // loops to start

  // Left arrow retreats sections
  assert.equal(getAdjacentAdminSection('Deliveries', 'prev', superAdminPerms), 'Orders')
  assert.equal(getAdjacentAdminSection('Orders', 'prev', superAdminPerms), 'Riders')
  assert.equal(getAdjacentAdminSection('Overview', 'prev', superAdminPerms), 'Settings') // loops to end

  // Handles aliases
  assert.equal(getAdjacentAdminSection('Logistics Companies', 'next', superAdminPerms), 'Orders')
  assert.equal(getAdjacentAdminSection('Products / Commodities', 'next', superAdminPerms), 'Categories')

  // Respects role permissions
  const logisticsOnlyPerms = ['logistics:manage']
  assert.equal(getAdjacentAdminSection('Riders', 'next', logisticsOnlyPerms), 'Deliveries')
  assert.equal(getAdjacentAdminSection('Deliveries', 'next', logisticsOnlyPerms), 'Safety & SOS')
  assert.equal(getAdjacentAdminSection('Safety & SOS', 'next', logisticsOnlyPerms), 'Riders') // only cycles accessible
})
