import type { IconName } from './icon'

export type PaymentStatus = 'Completed' | 'Pending' | 'Failed'

export type PaymentFilter = 'All' | PaymentStatus

export type PaymentAvatarTone = 'red' | 'blue' | 'purple' | 'green' | 'gold'

export type PaymentCardTone = 'green' | 'lime' | 'soft' | 'dark'

export type PaymentRecord = {
  id: string
  order: string
  customer: string
  amount: string
  amountValue?: number
  fee: string
  net: string
  method: string
  status: PaymentStatus
  tone: string
  time: string
  paidAt?: string
  settlement: string
}

export type PaymentSummaryCard = {
  detail: string
  icon: IconName
  label: string
  tone: PaymentCardTone
  trend: string
  value: string
}

export type PaymentMethodMetric = {
  label: string
  value: string
  percent: number
  tone: PaymentCardTone
}

export type PaymentSettlementItem = {
  amount: string
  label: string
  schedule: string
}
