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

export type OrderDeliveryStatus = 'Delivering' | 'Completed' | 'Failed'

export type OrderAvatarTone = 'red' | 'blue' | 'purple' | 'green' | 'gold'

export type OrderSortDirection = 'desc' | 'asc'

export type OrderServiceType = 'Express' | 'Regular'

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
