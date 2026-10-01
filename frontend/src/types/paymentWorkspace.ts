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
  transactionReference?: string
  verificationStatus?: string
  settlementStatus?: string
}

export type PaymentAuditEvent = {
  event_id: number
  event_type: string
  actor: string
  reason: string
  reference?: string
  amount?: number
  created_at: string
}
export type PaymentDetail = {
  payment: Record<string, unknown> & {
    payment_id: number
    order_id: number
    amount: number
    version: string
    verification_status: string
    settlement_status: string
    payment_status: string
  }
  order: {
    order_id: number
    order_status: string
    payment_status: string
    total_amount: number
    payment_method: string
  }
  farmer: null | { farmer_user_id: number; bank_details?: unknown }
  payout: null | Record<string, unknown>
  refunds: Record<string, unknown>[]
  case: {
    dispute_status: string
    dispute_outcome?: string
    dispute_reason?: string
    failure_status: string
    failure_resolution?: string
  }
  history: PaymentAuditEvent[]
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
