import type { OrderRow, PaymentRecord } from '../types/dashboard'
import { getNumber, getString, isRecord } from './adminDataValue'

export const parseOrder = (value: unknown): OrderRow => {
  const row = isRecord(value) ? value : {}
  return {
    customer: getString(row.customer, 'Customer not recorded'),
    id: getString(row.id, 'AG-record'),
    initial: getString(row.initial, 'AG'),
    item: getString(row.item, 'Commodity not recorded'),
    qty: getString(row.qty, '0 units'),
    status: getString(row.status, 'Pending'),
    time: getString(row.time, 'Not recorded'),
    tone: getString(row.tone, 'blue'),
    total: getString(row.total, 'PHP 0.00'),
  }
}

export const parsePayment = (value: unknown): PaymentRecord => {
  const row = isRecord(value) ? value : {}
  const status = getString(row.status)
  return {
    amount: getString(row.amount, 'PHP 0.00'),
    amountValue: getNumber(row.amountValue),
    customer: getString(row.customer, 'Customer not recorded'),
    fee: getString(row.fee, 'Not recorded'),
    id: getString(row.id, 'PY-record'),
    method: getString(row.method, 'Not set'),
    net: getString(row.net, 'PHP 0.00'),
    order: getString(row.order, 'Order not recorded'),
    paidAt: getString(row.paidAt),
    settlement: getString(row.settlement, 'Not set'),
    settlementStatus: getString(row.settlementStatus, 'pending'),
    transactionReference: getString(row.transactionReference) || undefined,
    verificationStatus: getString(row.verificationStatus, 'unverified'),
    status: status === 'Completed' ? 'Completed' : status === 'Failed' ? 'Failed' : 'Pending',
    time: getString(row.time, 'Not recorded'),
    tone: getString(row.tone, 'blue'),
  }
}
