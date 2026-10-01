import type { IconName } from './icon'

export type OrderRow = {
  id: string
  customer: string
  initial: string
  item: string
  qty: string
  total: string
  status: string
  tone: string
  time: string
}

export type OrderFilter = 'All' | 'Success' | 'Pending' | 'Failed'

export type OrderStatusGroup = Exclude<OrderFilter, 'All'>

export type OrderAvatarTone = 'red' | 'blue' | 'purple' | 'green' | 'gold'

export type OrderSortDirection = 'desc' | 'asc'

export type OrderServiceType = 'Express' | 'Regular' | 'Not recorded'

export type OrderWorkspaceRow = {
  order: OrderRow
  avatarTone: OrderAvatarTone
  courier: string
  courierTone: OrderAvatarTone
  destination: string
  estimatedArrival: string
  orderDate: string
  serviceType: OrderServiceType
  sortIndex: number
  statusGroup: OrderStatusGroup
  trackingNumber: string
}

export type OrderSummaryCard = {
  label: string
  value: string
  detail: string
  trend: string
  icon: IconName
  tone: 'green' | 'blue' | 'orange' | 'red'
  trendTone: 'green' | 'red'
}

export type OrderAuditEvent = {
  actor: string
  created_at: string
  event_id: number
  event_type: 'status_changed' | 'cancellation_reviewed' | 'refund_completed' | 'exception_resolved'
  metadata: Record<string, unknown>
  new_payment_status: string | null
  new_status: string | null
  previous_payment_status: string | null
  previous_status: string | null
  reason: string
}

export type OrderDetail = {
  order: {
    order_id: number
    client_order_id: string | null
    buyer_name: string | null
    contact_number: string | null
    order_status: string
    payment_status: string
    payment_method: string
    total_amount: number
    delivery_address: string | null
    order_date: string | null
    created_at: string
    updated_at: string | null
    cancellation_reason: string | null
    cancelled_by_role: string | null
    cancelled_at: string | null
  }
  payment: null | Record<string, unknown>
  delivery: null | {
    delivery_id: number
    delivery_status: string
    estimated_delivery_time: string | null
    actual_delivery_time: string | null
    pickup_location: string | null
    dropoff_location: string | null
    pickup_contact: string | null
    dropoff_contact: string | null
    rider_id: string | null
    rider_name: string | null
    rider_phone: string | null
  }
  items: {
    commodity_id: number
    name: string
    quantity: number
    total: number
  }[]
  case: {
    cancellation_decision: 'approved' | 'rejected' | null
    cancellation_reviewed_by: string | null
    cancellation_reviewed_at: string | null
    cancellation_note: string | null
    exception_status: 'open' | 'resolved'
    exception_resolution: string | null
    exception_resolved_by: string | null
    exception_resolved_at: string | null
    dispute_status?: 'pending' | 'resolved' | 'rejected' | null
    dispute_category?: string | null
    dispute_reason?: string | null
    dispute_requested_resolution?: 'full_refund' | 'partial_refund' | 'replacement' | 'other' | string | null
    dispute_submitted_at?: string | null
    dispute_resolved_at?: string | null
    dispute_resolution_note?: string | null
  }
  history: OrderAuditEvent[]
}
