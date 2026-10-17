import { expect, test } from '@playwright/test'

test('admin records a completed transfer reference and sees allocated deliveries', async ({
  page,
}) => {
  const writes = []
  const payout = {
    request_id: '12345678-1234-1234-1234-123456789abc',
    user_id: 'rider-auth',
    user_role: 'rider',
    amount: 50.25,
    payout_method: 'gcash',
    account_name: 'Test Rider',
    account_number: '09123456789',
    status: 'approved',
    requester_name: 'Test Rider',
    created_at: '2026-10-15T01:00:00Z',
    updated_at: '2026-10-15T01:00:00Z',
    requires_reconciliation: false,
    deliveries: [{ delivery_id: 75, amount: 50.25 }],
  }
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path === '/api/auth/session')
      return route.fulfill({
        json: {
          authenticated: true,
          admin: {
            email: 'finance@example.test',
            name: 'Finance',
            role: 'admin',
            permissions: ['payments:view', 'payments:manage'],
          },
        },
      })
    if (path === '/api/admin/dashboard')
      return route.fulfill({
        json: {
          overview: {},
          payments: [],
          orders: [],
          entityRows: {},
          users: [],
          farmers: [],
        },
      })
    if (path === '/api/admin/payments/payout-requests') {
      if (req.method() === 'POST') {
        const body = req.postDataJSON()
        writes.push(body)
        payout.status = 'paid'
        payout.payout_reference = body.payout_reference
        return route.fulfill({ json: { success: true } })
      }
      return route.fulfill({ json: { summary: { approved_count: 1 }, requests: [payout] } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Payments', exact: true }).click()
  await page.getByRole('button', { name: 'Cash-Out Requests' }).click()
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('approved')
  await page.getByRole('button', { name: 'Mark Paid', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Delivery #75:')).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm Disbursement' }).click()
  await expect(
    dialog.getByText('Enter the reference from the completed GCash or bank transfer.'),
  ).toBeVisible()
  expect(writes).toHaveLength(0)
  await dialog.getByLabel('Completed transfer reference *', { exact: true }).fill('GCASH-12345')
  await dialog.getByRole('button', { name: 'Confirm Disbursement' }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([
    { request_id: payout.request_id, action: 'mark_paid', payout_reference: 'GCASH-12345' },
  ])
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('paid')
  await page.getByRole('button', { name: `View details for ${payout.request_id}` }).click()
  await expect(page.getByRole('dialog').getByText('GCASH-12345')).toBeVisible()
})
