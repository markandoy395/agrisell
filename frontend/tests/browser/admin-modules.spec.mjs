import { expect, test } from '@playwright/test'

const permissions = [
  'overview:view',
  'users:manage',
  'farmers:manage',
  'logistics:manage',
  'orders:manage',
  'payments:view',
  'payments:manage',
  'sales:manage',
  'reviews:manage',
  'settings:manage',
  'admin:manage',
]

const dashboard = {
  administrators: [],
  entityRows: {},
  farmerFarms: [],
  farmers: [],
  orders: [],
  overview: {},
  payments: [],
  users: [],
}

const installApi = async (page, grantedPermissions, calls = []) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    const postData = request.postData()
    calls.push({
      method: request.method(),
      path,
      body: postData ? JSON.parse(postData) : undefined,
    })
    if (path === '/api/auth/session') {
      return route.fulfill({
        json: {
          authenticated: true,
          admin: {
            email: 'admin@example.invalid',
            name: 'Test Admin',
            permissions: grantedPermissions,
            role: 'admin',
          },
        },
      })
    }
    if (path === '/api/admin/dashboard') return route.fulfill({ json: dashboard })
    if (path === '/api/admin/preferences' && request.method() === 'GET') {
      return route.fulfill({ json: { autoApprove: true, digest: true } })
    }
    if (path === '/api/admin/sales') return route.fulfill({ json: { products: [], sales: [] } })
    return route.fulfill({ json: {} })
  })
}

test('browser navigation reflects server-issued module permissions', async ({ page }) => {
  const calls = []
  await installApi(page, ['users:manage'], calls)
  await page.goto('./')

  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Users', exact: true })).toBeEnabled()
  for (const section of ['Farmers', 'Payments', 'Sales & Discounts', 'Settings']) {
    await expect(page.getByRole('button', { name: section, exact: true })).toBeDisabled()
  }
})

test('user creation, sales, payments, and settings remain usable through browser workflows', async ({
  page,
}) => {
  const calls = []
  await installApi(page, permissions, calls)
  await page.goto('./')

  await page.getByRole('button', { name: 'Users', exact: true }).click()
  await page.getByRole('button', { name: 'Add user', exact: true }).click()
  const userDialog = page.getByRole('dialog', { name: 'Create user account' })
  await userDialog.getByLabel('Email address').fill('buyer@example.invalid')
  await userDialog.getByLabel('Temporary password').fill('temporary-password')
  await userDialog.getByLabel('First name').fill('Buyer')
  await userDialog.getByLabel('Last name').fill('Account')
  await userDialog.getByRole('button', { name: 'Create account' }).click()
  await expect(userDialog).toBeHidden()
  expect(calls.some(({ method, path }) => method === 'POST' && path === '/api/admin/users')).toBe(
    true,
  )

  await page.getByRole('button', { name: 'Sales & Discounts', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sales & Discounts' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create sale' })).toBeEnabled()

  await page.getByRole('button', { name: 'Payments', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle daily admin digest' }).click()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect
    .poll(
      () =>
        calls.find(({ method, path }) => method === 'PUT' && path === '/api/admin/preferences')
          ?.body,
    )
    .toEqual({ autoApprove: true, digest: false })
})
