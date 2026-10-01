import type {
  PaymentCardTone,
  PaymentMethodMetric,
  PaymentRecord,
  PaymentSettlementItem,
  PaymentSummaryCard,
} from '../../types/dashboard'

const METHOD_TONES: PaymentCardTone[] = ['green', 'lime', 'soft', 'dark']

export const formatPaymentMoney = (amount: number) =>
  new Intl.NumberFormat('en-PH', { currency: 'PHP', style: 'currency' }).format(amount)

export const getPaymentAmount = (payment: PaymentRecord) => {
  if (typeof payment.amountValue === 'number') return payment.amountValue
  const parsed = Number(payment.amount.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export const createPaymentSummary = (payments: PaymentRecord[]): PaymentSummaryCard[] => {
  const completed = payments.filter((payment) => payment.status === 'Completed')
  const pending = payments.filter((payment) => payment.status === 'Pending')
  const failed = payments.filter((payment) => payment.status === 'Failed')
  const total = (items: PaymentRecord[]) =>
    items.reduce((sum, payment) => sum + getPaymentAmount(payment), 0)
  const successRate = payments.length
    ? Math.round((completed.length / payments.length) * 1000) / 10
    : 0
  return [
    {
      detail: 'Completed payment collections',
      icon: 'card',
      label: 'Collected',
      tone: 'green',
      trend: 'Live',
      value: formatPaymentMoney(total(completed)),
    },
    {
      detail: 'Awaiting confirmation',
      icon: 'calendar',
      label: 'Pending',
      tone: 'lime',
      trend: 'Live',
      value: formatPaymentMoney(total(pending)),
    },
    {
      detail: 'Completed payment attempts',
      icon: 'trend',
      label: 'Success rate',
      tone: 'soft',
      trend: 'Live',
      value: `${successRate}%`,
    },
    {
      detail: 'Failed payment attempts',
      icon: 'close',
      label: 'Exceptions',
      tone: 'dark',
      trend: `${failed.length} open`,
      value: formatPaymentMoney(total(failed)),
    },
  ]
}

export const createMethodMetrics = (payments: PaymentRecord[]): PaymentMethodMetric[] => {
  const byMethod = payments.reduce<Map<string, number>>((totals, payment) => {
    const method = payment.method || 'Not set'
    totals.set(method, (totals.get(method) ?? 0) + getPaymentAmount(payment))
    return totals
  }, new Map())
  const total = Array.from(byMethod.values()).reduce((sum, amount) => sum + amount, 0)
  return Array.from(byMethod.entries())
    .sort(([, current], [, next]) => next - current)
    .slice(0, METHOD_TONES.length)
    .map(([label, amount], index) => ({
      label,
      percent: total ? Math.round((amount / total) * 100) : 0,
      tone: METHOD_TONES[index],
      value: formatPaymentMoney(amount),
    }))
}

export const createSettlementItems = (payments: PaymentRecord[]): PaymentSettlementItem[] => {
  const total = (status: PaymentRecord['status']) =>
    payments
      .filter((payment) => payment.status === status)
      .reduce((sum, payment) => sum + getPaymentAmount(payment), 0)
  return [
    {
      amount: formatPaymentMoney(total('Completed')),
      label: 'Completed collections',
      schedule: 'Ready for settlement review',
    },
    {
      amount: formatPaymentMoney(total('Pending')),
      label: 'Pending collections',
      schedule: 'Awaiting payment confirmation',
    },
  ]
}
