import type { EntityRecord, PaymentRecord } from '../../types/dashboard'

export type PaymentWorkspaceProps = {
  paymentActivityBars: number[]
  payments: PaymentRecord[]
  search: string
  created: EntityRecord[]
  activeOnly: boolean
  onToggleFilter: () => void
  period?: string
  canManage: boolean
  onDataChanged: () => Promise<void>
  onNotice: (message: string) => void
}
