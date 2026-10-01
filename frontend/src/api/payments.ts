import { requestAdminApi } from './adminAuth'
import type { PaymentDetail } from '../types/dashboard'

export const fetchPaymentDetail = async (id: string, signal?: AbortSignal) =>
  (await requestAdminApi(`/api/admin/payments/${encodeURIComponent(id.replace(/\D/g, ''))}`, {
    signal,
  })) as PaymentDetail

export const savePaymentAction = async (body: Record<string, unknown>) =>
  (await requestAdminApi('/api/admin/payments', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as PaymentDetail

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
export const downloadPaymentReport = async () => {
  const rows = (await requestAdminApi('/api/admin/payments/report')) as Record<string, unknown>[]
  const columns = [
    'payment_id',
    'order_id',
    'payment_date',
    'method',
    'transaction_reference',
    'gross_amount',
    'net_amount',
    'verification_status',
    'settlement_status',
    'settlement_reference',
    'payout_amount',
    'payout_status',
    'payout_reference',
    'refunded_amount',
    'payment_status',
  ]
  const csv = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `agrisell-payments-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
