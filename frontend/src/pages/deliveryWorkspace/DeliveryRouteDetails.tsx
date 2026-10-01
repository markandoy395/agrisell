import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import {
  getDeliveryRoutingUrl,
  ROUTING_DISABLED_MESSAGE,
} from '../../config/deliveryRouting'
import type { Delivery } from '../../types/delivery'
import { hasCoordinates, isClosed, isOverdue, label } from '../../utils/delivery'
import { DeliveryMap, type MapPin } from './DeliveryMap'

type Props = { delivery: Delivery; onBack: () => void }

const LocationIcon = ({ destination = false }: { destination?: boolean }) => (
  <svg
    className={`delivery-route-location-icon ${destination ? 'destination' : ''}`}
    width="22"
    height="22"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)

export function DeliveryRouteDetails({ delivery, onBack }: Props) {
  const routingBase = getDeliveryRoutingUrl()
  const [route, setRoute] = useState<number[][]>([])
  const [routeError, setRouteError] = useState('')
  const [routeReload, setRouteReload] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [now] = useState(() => Date.now())
  const pins = useMemo<MapPin[]>(() => {
    const next: MapPin[] = []
    if (hasCoordinates(delivery.pickup_lat, delivery.pickup_long))
      next.push({
        id: 'pickup',
        name: 'Pickup location',
        kind: 'pickup',
        latitude: delivery.pickup_lat!,
        longitude: delivery.pickup_long!,
      })
    if (hasCoordinates(delivery.dropoff_lat, delivery.dropoff_long))
      next.push({
        id: 'destination',
        name: 'Delivery destination',
        kind: 'destination',
        latitude: delivery.dropoff_lat!,
        longitude: delivery.dropoff_long!,
      })
    return next
  }, [delivery])
  const routeKey =
    pins.length === 2
      ? `${pins[0].longitude},${pins[0].latitude};${pins[1].longitude},${pins[1].latitude}`
      : ''
  useEffect(() => {
    const controller = new AbortController()
    if (!routeKey) return () => controller.abort()
    const timer = setTimeout(() => {
      setRoute([])
      setRouteError('')
      if (!routingBase) {
        setRouteError(ROUTING_DISABLED_MESSAGE)
        setRefreshing(false)
        return
      }
      setRefreshing(true)
      void fetch(`${routingBase}/route/v1/driving/${routeKey}?overview=full&geometries=geojson`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Route unavailable')
          const data = await response.json()
          const coordinates = data.routes?.[0]?.geometry?.coordinates
          if (data.code !== 'Ok' || !Array.isArray(coordinates))
            throw new Error('Route unavailable')
          if (!controller.signal.aborted) setRoute(coordinates)
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setRouteError(
              'The road route is temporarily unavailable. Pickup and destination markers remain visible.',
            )
        })
        .finally(() => {
          if (!controller.signal.aborted) setRefreshing(false)
        })
    }, 0)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [routeKey, routeReload, routingBase])
  const schedule =
    delivery.estimated_delivery_time &&
    Number.isFinite(Date.parse(delivery.estimated_delivery_time))
      ? new Date(delivery.estimated_delivery_time).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'Not scheduled'
  const tone = isOverdue(delivery, now)
    ? 'overdue'
    : isClosed(delivery.delivery_status)
      ? 'completed'
      : !delivery.rider_id
        ? 'unassigned'
        : 'active'
  const status = isOverdue(delivery, now)
    ? 'Overdue'
    : isClosed(delivery.delivery_status)
      ? label(delivery.delivery_status)
      : !delivery.rider_id
        ? 'Unassigned'
        : 'Active'
  return (
    <div className="delivery-route-view">
      <button className="delivery-route-back" type="button" onClick={onBack}>
        <Icon name="arrow" size={20} />
        Back to Delivery List
      </button>
      <header className="delivery-route-heading">
        <h2>Delivery Route</h2>
        <p>View the delivery route and location details.</p>
      </header>
      <div className="delivery-route-layout">
        <aside className="delivery-route-card">
          <div className="delivery-route-card-heading">
            <h3>Order Details</h3>
            <span className={`delivery-status-pill ${tone}`}>
              <i />
              {status}
            </span>
          </div>
          <dl>
            <div>
              <dt>
                <Icon name="calendar" size={21} />
                <span>Order ID</span>
              </dt>
              <dd>ORD-{delivery.order_id}</dd>
            </div>
            <div>
              <dt>
                <Icon name="profile" size={21} />
                <span>Rider</span>
              </dt>
              <dd>{delivery.rider_name || 'Unassigned'}</dd>
            </div>
            <div>
              <dt>
                <LocationIcon />
                <span>Pickup Location</span>
              </dt>
              <dd>
                <strong>{delivery.pickup_location || 'Not set'}</strong>
                {delivery.pickup_contact && <small>{delivery.pickup_contact}</small>}
              </dd>
            </div>
            <div>
              <dt>
                <LocationIcon destination />
                <span>Destination</span>
              </dt>
              <dd>
                <strong>{delivery.dropoff_location || 'Not set'}</strong>
                {delivery.dropoff_contact && <small>{delivery.dropoff_contact}</small>}
              </dd>
            </div>
            <div>
              <dt>
                <Icon name="calendar" size={21} />
                <span>Schedule</span>
              </dt>
              <dd>{schedule}</dd>
            </div>
            <div>
              <dt>
                <span className={`delivery-route-status-dot ${tone}`}>
                  <i />
                </span>
                <span>Status</span>
              </dt>
              <dd>{status}</dd>
            </div>
          </dl>
        </aside>
        <div className="delivery-route-map-wrap">
          <DeliveryMap
            routeMode
            pins={pins}
            line={route}
            refreshingRoute={refreshing}
            routeAvailable={Boolean(routingBase)}
            onRefreshRoute={() => {
              setRefreshing(true)
              setRouteReload((value) => value + 1)
            }}
          />
          {(routeError || !routeKey) && (
            <p className="delivery-route-message" role="status">
              {routeError || 'Pickup and destination coordinates are needed to display the route.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
