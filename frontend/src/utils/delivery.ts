import type { Delivery } from '../types/delivery'
export const closedStatuses = ['completed', 'delivered', 'cancelled', 'canceled', 'expired', 'failed', 'returned']
export const isClosed = (status: string) => closedStatuses.includes(status)
export const isSuccessfulDelivery = (status: string) =>
  ['completed', 'delivered'].includes(status.trim().toLowerCase())
export const isFailedDelivery = (status: string) => status.trim().toLowerCase() === 'failed'
export const isRecreatableDelivery = (status: string) =>
  ['cancelled', 'canceled', 'expired', 'returned'].includes(status.trim().toLowerCase())
export const canAssignDelivery = (status: string) =>
  ['pending', 'available', 'accepted', 'going_to_pickup', 'arrived_at_pickup'].includes(
    status.trim().toLowerCase(),
  )
export const canCancelDelivery = (status: string) =>
  ['pending', 'available', 'accepted', 'going_to_pickup', 'arrived_at_pickup'].includes(
    status.trim().toLowerCase(),
  )
export const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export const dateTime = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded'
export const hasCoordinates = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180
export const locationState = (
  delivery: Pick<Delivery, 'rider_id' | 'latitude' | 'longitude' | 'location_updated_at'>,
  now: number,
) => {
  if (!delivery.rider_id) return 'Unassigned'
  if (!hasCoordinates(delivery.latitude, delivery.longitude)) return 'No location'
  const timestamp = Date.parse(delivery.location_updated_at ?? '')
  if (!Number.isFinite(timestamp)) return 'Update time unknown'
  if (timestamp > now + 60000) return 'Update time invalid'
  return now - timestamp > 120000 ? 'Stale location' : 'Recent location'
}
export const isOverdue = (
  delivery: Pick<Delivery, 'delivery_status' | 'estimated_delivery_time'>,
  now: number,
) =>
  !isClosed(delivery.delivery_status) &&
  !!delivery.estimated_delivery_time &&
  Date.parse(delivery.estimated_delivery_time) < now
export const statusActions = (status: string) => {
  if (isClosed(status)) return []
  const next: Record<string, string> = {
    accepted: 'going_to_pickup',
    going_to_pickup: 'arrived_at_pickup',
    picked_up: 'going_to_delivery',
    going_to_delivery: 'arrived_at_delivery',
  }
  return [
    ...(next[status] ? [next[status]] : []),
    ...(['pending', 'available', 'accepted', 'going_to_pickup', 'arrived_at_pickup'].includes(
      status,
    )
      ? ['cancelled']
      : []),
    'failed',
  ]
}
