import type { Delivery } from '../../types/delivery'
import { dateTime, isClosed, isOverdue, label } from '../../utils/delivery'

import type { EntityRecord } from '../../types/entityWorkspace'

export const DELIVERY_PAGE_SIZE = 10

export const createFallbackDeliveries = (records: EntityRecord[]): Delivery[] =>
  records.map((r, i) => ({
    accuracy_meters: null,
    actual_delivery_time: null,
    created_at: new Date().toISOString(),
    customer_name: r.primary || 'Customer',
    delivery_id: Number(r.entityId) || i + 1,
    delivery_status:
      (r.status?.toLowerCase().replace(/\s+/g, '_') as Delivery['delivery_status']) || 'pending',
    dropoff_contact: null,
    dropoff_lat: null,
    dropoff_location: r.secondary || 'Address not specified',
    dropoff_long: null,
    estimated_delivery_time: null,
    latitude: null,
    location_updated_at: null,
    longitude: null,
    order_id: Number(r.category?.replace(/\D+/g, '')) || 0,
    pickup_contact: null,
    pickup_lat: null,
    pickup_location: null,
    pickup_long: null,
    rider_id: null,
    rider_name: null,
    rider_phone: null,
    total_weight_kg: null,
  }))


export const deliveryTone = (delivery: Delivery, now: number) =>
  isOverdue(delivery, now)
    ? 'overdue'
    : isClosed(delivery.delivery_status)
      ? 'completed'
      : !delivery.rider_id
        ? 'unassigned'
        : 'active'

export const deliveryStatusLabel = (delivery: Delivery, now: number) =>
  isOverdue(delivery, now)
    ? 'Overdue'
    : isClosed(delivery.delivery_status)
      ? label(delivery.delivery_status)
      : !delivery.rider_id
        ? 'Unassigned'
        : 'Active'

export const scheduleParts = (value: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return ['Not scheduled', '']
  const date = new Date(value)
  return [
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  ]
}

export const downloadDeliveries = (deliveries: Delivery[]) => {
  const safe = (value: unknown) => {
    const text = String(value ?? '')
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`
  }
  const rows = [
    ['Delivery', 'Order', 'Customer', 'Rider', 'Pickup', 'Destination', 'Schedule', 'Status'],
    ...deliveries.map((delivery) => [
      delivery.delivery_id,
      delivery.order_id,
      delivery.customer_name,
      delivery.rider_name,
      delivery.pickup_location,
      delivery.dropoff_location,
      dateTime(delivery.estimated_delivery_time),
      label(delivery.delivery_status),
    ]),
  ]
  const csv = rows.map((row) => row.map(safe).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'agrisell-deliveries.csv'
  link.click()
  URL.revokeObjectURL(url)
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const printDeliveryWaybill = (delivery: Delivery) => {
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.opener = null
  const schedule = dateTime(delivery.estimated_delivery_time)
  popup.document.write(`<!doctype html><html><head><title>Waybill ORD-${escapeHtml(delivery.order_id)}</title>
    <style>body{font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:32px;color:#17231b;line-height:1.5}h1{font-size:24px;margin:0 0 4px;font-weight:700}.muted{color:#607064}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px}.box{border:1px solid #b8c4ba;border-radius:8px;padding:16px}.box strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#607064;margin-bottom:6px}.route{grid-column:1/-1}.id{font-size:22px;font-weight:700}@media print{body{margin:12mm}}</style>
    </head><body><h1>AgriSell Delivery Waybill</h1><div class="id">ORD-${escapeHtml(delivery.order_id)}</div>
    <div class="grid"><div class="box"><strong>Customer</strong>${escapeHtml(delivery.customer_name || 'Not recorded')}</div>
    <div class="box"><strong>Rider</strong>${escapeHtml(delivery.rider_name || 'Unassigned')}<br>${escapeHtml(delivery.rider_phone || '')}</div>
    <div class="box route"><strong>Pickup</strong>${escapeHtml(delivery.pickup_location || 'Not set')}<br>${escapeHtml(delivery.pickup_contact || '')}</div>
    <div class="box route"><strong>Destination</strong>${escapeHtml(delivery.dropoff_location || 'Not set')}<br>${escapeHtml(delivery.dropoff_contact || '')}</div>
    <div class="box"><strong>Scheduled arrival</strong>${escapeHtml(schedule)}</div>
    <div class="box"><strong>Delivery ID</strong>${escapeHtml(delivery.delivery_id)}</div></div>
    <script>window.addEventListener('load',()=>{window.print();window.close()})</script></body></html>`)
  popup.document.close()
  return true
}
