import type { AdminDatabaseData } from '../../types/adminData'
import type { NotificationItem } from '../../types/dashboard'
import type { EntityRecord } from '../../types/entityWorkspace'
import type { OrderRow } from '../../types/orderWorkspace'
import type { PaymentRecord } from '../../types/paymentWorkspace'

const createOrderNotifications = (orders: OrderRow[]): NotificationItem[] =>
  orders
    .filter((order) => ['Pending', 'Processing', 'To Deliver'].includes(order.status))
    .slice(0, 5)
    .map((order) => ({
      id: `order-${order.id}`,
      message: `${order.customer} placed an order for ${order.item} (${order.qty}) · ${order.total}.`,
      read: false,
      time: order.time || 'New order',
      title: `Order ${order.id} update`,
    }))

const createApprovalNotifications = (
  farmers: EntityRecord[],
  riders: EntityRecord[],
): NotificationItem[] => {
  const pendingFarmers: NotificationItem[] = farmers
    .filter((f) => f.approvalStatus === 'Pending approval' || f.status === 'Pending')
    .slice(0, 3)
    .map((farmer) => ({
      id: `approval-farmer-${farmer.entityId ?? farmer.primary}`,
      message: `${farmer.primary} submitted documents for seller verification.`,
      read: false,
      time: 'Pending review',
      title: 'Farmer approval pending',
    }))

  const pendingRiders: NotificationItem[] = riders
    .filter((r) => r.approvalStatus === 'Pending approval' || r.status === 'Pending')
    .slice(0, 3)
    .map((rider) => ({
      id: `approval-rider-${rider.entityId ?? rider.primary}`,
      message: `${rider.primary} is waiting for delivery activation.`,
      read: false,
      time: 'Pending review',
      title: 'Rider verification pending',
    }))

  return [...pendingFarmers, ...pendingRiders]
}

const createPaymentNotifications = (payments: PaymentRecord[]): NotificationItem[] =>
  payments
    .filter((payment) => payment.status === 'Failed' || payment.tone === 'red')
    .slice(0, 4)
    .map((payment) => ({
      id: `payment-failed-${payment.id}`,
      message: `Payment ${payment.id} for ${payment.order} (${payment.amount}) failed via ${payment.method}.`,
      read: false,
      time: payment.time || 'Action required',
      title: 'Payment failed',
    }))

const createDeliveryNotifications = (deliveries: EntityRecord[]): NotificationItem[] =>
  deliveries
    .filter((d) => ['Failed', 'Cancelled', 'Returned'].includes(d.status) || d.tone === 'red')
    .slice(0, 4)
    .map((delivery) => ({
      id: `delivery-exception-${delivery.entityId ?? delivery.primary}`,
      message: `${delivery.primary} (${delivery.category}): ${delivery.secondary}.`,
      read: false,
      time: delivery.value || 'Delivery exception',
      title: `Delivery exception: ${delivery.status}`,
    }))

const createInventoryNotifications = (
  lowStockCount: number,
  commodities: EntityRecord[],
): NotificationItem[] => {
  const notifications: NotificationItem[] = []
  if (lowStockCount > 0) {
    notifications.push({
      id: 'inventory-low-stock-summary',
      message: `${lowStockCount} ${lowStockCount === 1 ? 'commodity requires' : 'commodities require'} replenishment.`,
      read: false,
      time: 'Inventory alert',
      title: 'Low stock warning',
    })
  }
  const flagged = commodities
    .filter((c) => c.status === 'Low stock' || c.status === 'Out of stock' || c.tone === 'red')
    .slice(0, 3)
    .map((commodity) => ({
      id: `inventory-item-${commodity.primary.toLowerCase().replace(/\s+/g, '-')}`,
      message: `${commodity.primary} (${commodity.secondary}) is currently ${commodity.status.toLowerCase()}.`,
      read: false,
      time: commodity.value || 'Stock alert',
      title: `Low stock: ${commodity.primary}`,
    }))
  return [...notifications, ...flagged]
}

const createComplaintNotifications = (reviews: EntityRecord[]): NotificationItem[] =>
  reviews
    .filter(
      (r) =>
        r.reportStatus === 'open' ||
        (r.abuseFlags && r.abuseFlags.length > 0) ||
        r.status === 'Needs reply' ||
        (typeof r.rating === 'number' && r.rating <= 2),
    )
    .slice(0, 4)
    .map((review) => {
      const issue = review.comment || review.secondary || 'Customer reported an issue'
      return {
        id: `complaint-review-${review.entityId ?? review.primary}`,
        message: `${review.primary}: "${issue}" (${review.category}).`,
        read: false,
        time: review.reviewDate || 'Needs attention',
        title: 'Customer complaint / reported review',
      }
    })

export const deriveMarketplaceNotifications = (data: AdminDatabaseData): NotificationItem[] => {
  const orders = createOrderNotifications(data.orders ?? [])
  const approvals = createApprovalNotifications(
    data.farmers ?? [],
    data.entityRows?.['Riders'] ?? [],
  )
  const payments = createPaymentNotifications(data.payments ?? [])
  const deliveries = createDeliveryNotifications(data.entityRows?.['Deliveries'] ?? [])
  const inventory = createInventoryNotifications(
    data.overview?.lowStock ?? 0,
    data.entityRows?.['Commodities'] ?? [],
  )
  const complaints = createComplaintNotifications(data.entityRows?.['Reviews'] ?? [])

  return [...orders, ...approvals, ...payments, ...deliveries, ...inventory, ...complaints]
}
