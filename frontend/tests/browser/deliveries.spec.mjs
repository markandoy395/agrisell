import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { deliveryRequest } from '../../../supabase/functions/admin-api/deliveries.ts'

let db
const rider = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
test.beforeEach(async ({ page }) => {
  db = new PGlite()
  for (const file of [
    '../fixtures/delivery-schema.sql',
    '../fixtures/create-delivery-dependency.sql',
    '../fixtures/assignment-validation-dependency.sql',
    '../../../supabase/migrations/20260907010000_admin_deliveries.sql',
    '../../../supabase/migrations/20260909010000_admin_rider_tracking.sql',
    '../../../supabase/migrations/20260917130000_admin_delivery_edit_retry.sql',
  ])
    await db.exec(await readFile(new URL(file, import.meta.url), 'utf8'))
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/auth/session')
      return route.fulfill({
        json: {
          authenticated: true,
          admin: {
            email: 'test-admin@example.invalid',
            name: 'Test Admin',
            role: 'admin',
            permissions: ['logistics:manage'],
          },
        },
      })
    if (path === '/api/admin/dashboard') return route.fulfill({ json: { overview: {} } })
    try {
      const result = await deliveryRequest(
        {
          path,
          method: req.method(),
          permissions: ['logistics:manage'],
          actor: 'test-admin@example.invalid',
          storageOrigin: 'https://example.supabase.co',
          query: url.searchParams,
          body: req.postDataJSON(),
        },
        async (dbPath, init) => {
          if (dbPath.startsWith('/storage/'))
            return { signedURL: '/object/sign/delivery-proofs/test/photo.png?token=test' }
          const name = dbPath.split('/').pop(),
            args = JSON.parse(init.body)
          const entries = Object.entries(args),
            params = entries.map(([key], i) => `${key} := $${i + 1}`).join(',')
          return (
            await db.query(
              `select public.${name}(${params}) result`,
              entries.map(([, value]) =>
                typeof value === 'object' ? JSON.stringify(value) : value,
              ),
            )
          ).rows[0].result
        },
      )
      await route.fulfill({ status: result?.status ?? 404, json: result?.body ?? {} })
    } catch (error) {
      await route.fulfill({ status: error.status ?? 500, json: { message: error.message } })
    }
  })
  await page.route('https://routing.test.invalid/**', (route) =>
    route.fulfill({
      json: {
        code: 'Ok',
        routes: [
          {
            distance: 4500,
            duration: 600,
            geometry: {
              coordinates: [
                [121.05, 14.65],
                [121, 14.6],
                [121.1, 14.7],
              ],
            },
          },
        ],
      },
    }),
  )
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 256
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#edf3ed'
      ctx.fillRect(0, 0, 256, 256)
      ctx.fillStyle = '#fff'
      ctx.fillRect(100, 0, 15, 256)
      ctx.fillRect(0, 150, 256, 15)
      return c.toDataURL('image/png').split(',')[1]
    }),
    'base64',
  )
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  )
  await page.route('https://example.supabase.co/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  )
  await page.goto('./')
  await page.getByRole('button', { name: 'Deliveries', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add delivery', exact: true })).toBeEnabled()
})
test.afterEach(async () => {
  await db?.close()
})

test('cancels a delivery from the dedicated confirmation dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Add delivery', exact: true }).click()
  await page.getByRole('combobox', { name: 'Order', exact: true }).selectOption('1')
  await page.getByLabel('Scheduled arrival', { exact: true }).fill('2026-12-01T16:00')
  await page.getByRole('button', { name: 'Create delivery', exact: true }).click()
  await page.getByRole('button', { name: 'Actions for delivery 1', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Cancel delivery', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel Delivery', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Order: ORD-1')
  await dialog
    .getByPlaceholder('Enter reason for cancellation...')
    .fill('Buyer requested cancellation')
  await expect(dialog).toContainText('28/500')
  await dialog.getByRole('button', { name: 'Confirm Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('cell', { name: 'Cancelled', exact: true })).toBeVisible()
})

test('map stays visible without deliveries and shows an unassigned rider despite a delivery API failure', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Live Tracking', exact: true }).click()
  await expect(page.getByLabel('Interactive delivery map', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'No location', exact: true })).toHaveCount(2)
  await db.query('insert into public.rider_locations values($1,14.65,121.05,10,now())', [rider])
  await page.route('**/api/admin/deliveries/tracking*', (route) =>
    route.fulfill({ status: 502, json: { message: 'Delivery data unavailable.' } }),
  )
  await page.getByRole('button', { name: 'Refresh locations', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rider Test Rider', exact: true })).toBeVisible()
  await expect(
    page.getByText('Delivery routes are unavailable. Rider locations update independently.', {
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Rider Test Rider', exact: true }).click()
  await expect(page.getByText('Coordinates: 14.65, 121.05', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Follow selected rider', { exact: true })).toBeChecked()
  await page.getByRole('searchbox', { name: 'Search riders or deliveries' }).fill('Second Rider')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Rider Test Rider', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Interactive delivery map', { exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search riders or deliveries' }).fill('')
  await expect(page.getByRole('button', { name: 'Rider Test Rider', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/rider-map-without-delivery.png', fullPage: true })
})

test('create, reload, assign, track GPS, route, change status, view evidence and play history', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: 'Add delivery', exact: true }).click()
  await page.getByRole('combobox', { name: 'Order', exact: true }).selectOption('1')
  await page.getByLabel('Scheduled arrival', { exact: true }).fill('2026-12-01T16:00')
  await page.getByRole('button', { name: 'Create delivery', exact: true }).click()
  await expect(page.getByRole('cell', { name: /Delivery 1 · Order #1/ })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Deliveries', exact: true }).click()
  await expect(page.getByRole('cell', { name: /Delivery 1 · Order #1/ })).toBeVisible()
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await page.getByRole('combobox', { name: 'Approved rider', exact: true }).selectOption(rider)
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Accepted', exact: true })).toBeVisible()
  await page
    .locator('tr')
    .filter({ hasText: 'Delivery 1 · Order #1' })
    .getByRole('button', { name: 'Track rider' })
    .click()
  await expect(page.getByRole('cell', { name: 'No location', exact: true })).toHaveCount(2)
  await db.query('insert into public.rider_locations values($1,14.65,121.05,10,now())', [rider])
  await page.getByRole('button', { name: 'Refresh locations', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rider Test Rider', exact: true })).toBeVisible()
  await expect(page.getByText(/Road distance: 4.5 km/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pickup location', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Delivery destination', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Fit all markers', exact: true }).click()
  await page.getByRole('button', { name: 'Delivery List', exact: true }).click()
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Next status', exact: true })
    .selectOption('going_to_pickup')
  await page.getByLabel('Reason', { exact: true }).fill('Dispatch confirmed')
  await page.getByRole('button', { name: 'Save status', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Going To Pickup', exact: true })).toBeVisible()
  await db.query(
    "insert into public.delivery_proofs(delivery_id,proof_stage,proof_type,file_path,confirmed_at) values(1,'delivery','photo','test/photo.png',now())",
  )
  await db.query(
    "update public.rider_locations set latitude=14.66,location_updated_at=now()+interval '1 second' where rider_id=$1",
    [rider],
  )
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Delivery evidence', exact: true })).toBeVisible()
  await expect(page.getByText('Tomatoes · 10 units · PHP 100.00')).toBeVisible()
  await page.getByRole('button', { name: 'Play trip', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click()
  await page.screenshot({ path: 'test-results/delivery-details.png', fullPage: true })
  expect(errors).toEqual([])
})

test('filters, CSV export, reassignment and failure close the active trip', async ({ page }) => {
  for (const id of [1, 2])
    await db.query('select public.admin_save_delivery($1::jsonb,$2)', [
      JSON.stringify({
        action: 'create',
        order_id: id,
        scheduled_at: id === 1 ? '2020-01-01T00:00:00Z' : '2026-12-01T08:00:00Z',
        command_id: `seed-${id}`,
      }),
      'test-admin@example.invalid',
    ])
  await db.query('select public.admin_save_delivery($1::jsonb,$2)', [
    JSON.stringify({
      action: 'assign',
      delivery_id: 1,
      previous_status: 'available',
      rider_id: rider,
      command_id: 'seed-assign',
    }),
    'test-admin@example.invalid',
  ])
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.getByLabel('Overdue only', { exact: true }).check()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('agrisell-deliveries.csv')
  await page.getByLabel('Overdue only', { exact: true }).uncheck()
  await page.getByRole('combobox', { name: 'Rider', exact: true }).selectOption('unassigned')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Rider', exact: true }).selectOption('')
  await page
    .locator('tr')
    .filter({ hasText: 'Delivery 1 · Order #1' })
    .getByRole('button', { name: 'Details', exact: true })
    .click()
  await page.getByRole('combobox', { name: 'Approved rider', exact: true }).selectOption(second)
  await page.getByLabel('Assignment reason', { exact: true }).fill('Original rider unavailable')
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click()
  await expect(page.getByRole('cell', { name: /Second Rider/ })).toBeVisible()
  await page.getByRole('combobox', { name: 'Next status', exact: true }).selectOption('failed')
  await page.getByLabel('Reason', { exact: true }).fill('Delivery cannot proceed')
  await page.getByRole('button', { name: 'Save status', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Failed', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Live Tracking', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await expect(page.getByRole('cell', { name: 'No active delivery', exact: true })).toHaveCount(2)
})

test('stale GPS, automatic polling, refresh errors, and stopping tracking requests', async ({
  page,
}) => {
  await db.query('select public.admin_save_delivery($1::jsonb,$2)', [
    JSON.stringify({
      action: 'create',
      order_id: 1,
      scheduled_at: '2026-12-01T08:00:00Z',
      command_id: 'stale-create',
    }),
    'test-admin@example.invalid',
  ])
  await db.query('select public.admin_save_delivery($1::jsonb,$2)', [
    JSON.stringify({
      action: 'assign',
      delivery_id: 1,
      previous_status: 'available',
      rider_id: rider,
      command_id: 'stale-assign',
    }),
    'test-admin@example.invalid',
  ])
  await db.query(
    "insert into public.rider_locations values($1,14.65,121.05,10,now()-interval '5 minutes')",
    [rider],
  )
  let trackingRequests = 0
  page.on('request', (req) => {
    if (req.url().includes('/api/admin/deliveries/riders')) trackingRequests++
  })
  await page.clock.install()
  await page.getByRole('button', { name: 'Live Tracking', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Stale location', exact: true })).toBeVisible()
  await page.route('**/api/admin/deliveries/riders*', (route) =>
    route.fulfill({ status: 502, json: { message: 'Tracking connection lost.' } }),
  )
  await page.clock.runFor(16000)
  await expect(page.getByRole('alert')).toContainText('Tracking connection lost.')
  await expect(page.getByRole('cell', { name: 'Stale location', exact: true })).toBeVisible()
  expect(trackingRequests).toBeGreaterThanOrEqual(2)
  await page.getByRole('button', { name: 'Delivery List', exact: true }).click()
  const before = trackingRequests
  await page.clock.runFor(31000)
  expect(trackingRequests).toBe(before)
})
