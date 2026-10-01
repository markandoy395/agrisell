import { useEffect, useMemo, useState } from 'react'
import { fetchDeliveries, fetchTrackedRiders } from '../../api/deliveries'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { Delivery, TrackedRider } from '../../types/delivery'
import { dateTime, hasCoordinates, label, locationState } from '../../utils/delivery'
import { DeliveryMap } from './DeliveryMap'
import type { MapPin } from './DeliveryMap'
import { Icon } from '../../components/ui/icon/Icon'
import {
  getDeliveryRoutingUrl,
  ROUTING_DISABLED_MESSAGE,
} from '../../config/deliveryRouting'

type Props = { search: string; selectedId: number | null; onSelect: (id: number | null) => void }
type Route = { key: string; coordinates: number[][]; distance: number; duration: number }
export function RiderTracking({ search, selectedId, onSelect }: Props) {
  const routingBase = getDeliveryRoutingUrl()
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [riders, setRiders] = useState<TrackedRider[]>([])
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null)
  const [deliveryError, setDeliveryError] = useState('')
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState('')
  const [lastFetched, setLastFetched] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [follow, setFollow] = useState(false)
  const [route, setRoute] = useState<Route | null>(null)
  const [routeError, setRouteError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      if (controller.signal.aborted) return
      setRefreshing(true)
      // A delivery failure must not prevent independent rider locations from loading.
      await Promise.allSettled([
        fetchTrackedRiders(controller.signal)
          .then((rows) => {
            if (!controller.signal.aborted) {
              setRiders(rows)
              setError('')
              setLastFetched(new Date().toISOString())
            }
          })
          .catch((cause) => {
            if (!controller.signal.aborted)
              setError(
                getApiErrorMessage(
                  cause,
                  'Location refresh failed. Showing the last available data.',
                ),
              )
          }),
        fetchDeliveries(true, controller.signal)
          .then((rows) => {
            if (!controller.signal.aborted) {
              setDeliveries(rows)
              setDeliveryError('')
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setDeliveries([])
              setDeliveryError(
                'Delivery routes are unavailable. Rider locations update independently.',
              )
            }
          }),
      ])
      if (!controller.signal.aborted) {
        setRefreshing(false)
        setNow(Date.now())
        timer = setTimeout(() => {
          void refresh()
        }, 15000)
      }
    }
    // Schedule the initial external request; cleanup cancels timers and in-flight fetches.
    timer = setTimeout(() => {
      void refresh()
    }, 0)
    const clock = setInterval(() => setNow(Date.now()), 15000)
    return () => {
      controller.abort()
      clearTimeout(timer)
      clearInterval(clock)
    }
  }, [reload])
  const visibleRiders = useMemo(() => {
    const terms = `${search} ${query}`.trim().toLowerCase()
    return riders.filter(
      (rider) =>
        !terms ||
        `${rider.rider_name} ${rider.rider_phone ?? ''} ${rider.rider_id}`
          .toLowerCase()
          .includes(terms) ||
        deliveries.some(
          (d) =>
            d.rider_id === rider.rider_id &&
            `${d.delivery_id} ${d.order_id} ${d.dropoff_location ?? ''}`
              .toLowerCase()
              .includes(terms),
        ),
    )
  }, [riders, deliveries, query, search])
  const requestedDelivery = deliveries.find((d) => d.delivery_id === selectedId)
  const selectedRider =
    visibleRiders.find((r) => r.rider_id === (selectedRiderId ?? requestedDelivery?.rider_id)) ??
    null
  const selected =
    requestedDelivery && (!selectedRiderId || requestedDelivery.rider_id === selectedRiderId)
      ? requestedDelivery
      : null
  const pins: MapPin[] = []
  for (const rider of visibleRiders) {
    if (!hasCoordinates(rider.latitude, rider.longitude)) continue
    pins.push({
      id: `rider:${rider.rider_id}`,
      name: `Rider ${rider.rider_name}`,
      latitude: rider.latitude!,
      longitude: rider.longitude!,
      kind: 'rider',
      stale: locationState(rider, now) !== 'Recent location',
    })
  }
  if (selected && hasCoordinates(selected.pickup_lat, selected.pickup_long))
    pins.push({
      id: 'pickup',
      name: 'Pickup location',
      latitude: selected.pickup_lat!,
      longitude: selected.pickup_long!,
      kind: 'pickup',
    })
  if (selected && hasCoordinates(selected.dropoff_lat, selected.dropoff_long))
    pins.push({
      id: 'destination',
      name: 'Delivery destination',
      latitude: selected.dropoff_lat!,
      longitude: selected.dropoff_long!,
      kind: 'destination',
    })
  const routeKey =
    selected &&
    selectedRider &&
    !error &&
    locationState(selectedRider, now) === 'Recent location' &&
    hasCoordinates(selected.dropoff_lat, selected.dropoff_long)
      ? [
          [selectedRider.longitude, selectedRider.latitude],
          ...(['accepted', 'going_to_pickup', 'arrived_at_pickup'].includes(
            selected.delivery_status,
          ) && hasCoordinates(selected.pickup_lat, selected.pickup_long)
            ? [[selected.pickup_long, selected.pickup_lat]]
            : []),
          [selected.dropoff_long, selected.dropoff_lat],
        ]
          .map((point) => point.join(','))
          .join(';')
      : ''
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setRoute(null)
      setRouteError('')
      if (!routeKey) return
      if (!routingBase) {
        setRouteError(ROUTING_DISABLED_MESSAGE)
        return
      }
      void fetch(`${routingBase}/route/v1/driving/${routeKey}?overview=full&geometries=geojson`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      })
        .then(async (result) => {
          if (!result.ok) throw new Error('Route unavailable')
          const data = await result.json()
          const first = data.routes?.[0]
          if (
            data.code !== 'Ok' ||
            !first ||
            !Number.isFinite(first.distance) ||
            !Number.isFinite(first.duration) ||
            !Array.isArray(first.geometry?.coordinates)
          )
            throw new Error('Route unavailable')
          if (!controller.signal.aborted)
            setRoute({
              key: routeKey,
              coordinates: first.geometry.coordinates,
              distance: first.distance,
              duration: first.duration,
            })
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setRouteError('Road route unavailable. Rider and destination markers remain available.')
        })
    }, 0)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [routeKey, routingBase])
  const selectRider = (id: string) => {
    setSelectedRiderId(id)
    setFollow(true)
    onSelect(deliveries.find((d) => d.rider_id === id)?.delivery_id ?? null)
  }
  const searchControl = (
    <label className="rider-tracking-search dashboard-filter-field">
      <span>Search</span>
      <span className="rider-tracking-search-box dashboard-filter-control">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rider, contact, order, or destination…"
        />
      </span>
    </label>
  )
  const followControl = (
    <label className="delivery-checkbox rider-follow">
      <input
        type="checkbox"
        checked={follow}
        disabled={
          !selectedRider || !hasCoordinates(selectedRider.latitude, selectedRider.longitude)
        }
        onChange={(e) => setFollow(e.target.checked)}
      />
      Follow selected rider
    </label>
  )
  return (
    <div className="rider-tracking">
      <div className="rider-tracking-toolbar">
        <div>
          <h2>Live Tracking</h2>
          <p>Refreshes every 15 seconds. GPS older than 2 minutes is stale.</p>
          <small>
            Last successful fetch: <strong>{dateTime(lastFetched)}</strong>
          </small>
        </div>
        <button type="button" disabled={refreshing} onClick={() => setReload((value) => value + 1)}>
          <Icon name="refresh" size={19} />
          {refreshing ? 'Refreshing…' : 'Refresh locations'}
        </button>
      </div>
      {error && (
        <p role="alert" className="rider-tracking-error">
          {error} Previously fetched positions may be out of date.
        </p>
      )}
      <p>Riders appear when their app shares GPS, with or without an assigned delivery.</p>
      <DeliveryMap
        searchControl={searchControl}
        followControl={followControl}
        pins={pins}
        line={route?.key === routeKey ? route.coordinates : []}
        follow={follow}
        selectedPin={selectedRider ? `rider:${selectedRider.rider_id}` : undefined}
        onSelect={(id) => {
          if (id.startsWith('rider:')) selectRider(id.slice(6))
        }}
      />
      {!pins.some((pin) => pin.kind === 'rider') && (
        <p role="status">
          {refreshing && !lastFetched
            ? 'Loading rider locations…'
            : visibleRiders.length
              ? 'Waiting for GPS updates from the rider app.'
              : 'No matching riders.'}
        </p>
      )}
      {deliveryError && <p role="status">{deliveryError}</p>}
      {selectedRider && (
        <article className="delivery-selected-rider">
          <h3>{selectedRider.rider_name}</h3>
          <p>
            {label(selectedRider.availability_status || 'unknown')} · Contact:{' '}
            {selectedRider.rider_phone || 'Not recorded'}
          </p>
          <p>
            Last GPS update: {dateTime(selectedRider.location_updated_at)} ·{' '}
            {locationState(selectedRider, now)}
          </p>
          {hasCoordinates(selectedRider.latitude, selectedRider.longitude) && (
            <p>
              Coordinates: {selectedRider.latitude}, {selectedRider.longitude}
            </p>
          )}
          {!selected && (
            <p>
              {deliveryError ? 'Delivery information unavailable.' : 'No active delivery assigned.'}
            </p>
          )}
        </article>
      )}
      {selected && (
        <article className="delivery-selected-rider">
          <h3>
            {selected.rider_name || 'Unassigned'} · Delivery {selected.delivery_id}
          </h3>
          <p>
            Order #{selected.order_id} · {label(selected.delivery_status)}
          </p>
          <p>
            Pickup: {selected.pickup_location || 'Not recorded'}
            <br />
            Destination: {selected.dropoff_location || 'Not recorded'}
          </p>
          <p>
            Last GPS update: {dateTime(selected.location_updated_at)} ·{' '}
            {locationState(selected, now)}
          </p>
          <p>Contact: {selected.rider_phone || 'Not recorded'}</p>
          {routeKey && route?.key === routeKey ? (
            <p>
              Road distance: {(route.distance / 1000).toFixed(1)} km · Estimated travel:{' '}
              {Math.ceil(route.duration / 60)} min · Arrival around{' '}
              {new Date(now + route.duration * 1000).toLocaleTimeString()}
              <br />
              <small>Driving estimate excludes traffic and pickup time.</small>
            </p>
          ) : (
            <p>
              {routeError ||
                'A recent rider location and destination coordinates are needed for a route estimate.'}
            </p>
          )}
        </article>
      )}
      <div className="user-table-panel">
        <div className="user-table-wrap">
          <table className="user-table rider-tracking-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Availability</th>
                <th>GPS status</th>
                <th>Last GPS update</th>
                <th>Active deliveries</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRiders.map((rider) => {
                const trips = deliveries.filter((d) => d.rider_id === rider.rider_id)
                const gpsState = locationState(rider, now)
                return (
                  <tr key={rider.rider_id}>
                    <td>
                      <strong>{rider.rider_name}</strong>
                    </td>
                    <td>
                      <span
                        className={`rider-status ${/^(online|available)$/i.test(rider.availability_status || '') ? 'online' : ''}`}
                      >
                        <i />
                        {label(rider.availability_status || 'unknown')}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`rider-status ${gpsState === 'Recent location' ? 'online' : ''}`}
                      >
                        <i />
                        {gpsState}
                      </span>
                    </td>
                    <td>{dateTime(rider.location_updated_at)}</td>
                    <td>
                      {deliveryError
                        ? 'Unavailable'
                        : trips.length
                          ? trips.map((d) => (
                              <button
                                type="button"
                                key={d.delivery_id}
                                onClick={() => {
                                  setSelectedRiderId(rider.rider_id)
                                  onSelect(d.delivery_id)
                                  setFollow(true)
                                }}
                              >
                                Delivery {d.delivery_id} · {label(d.delivery_status)}
                              </button>
                            ))
                          : 'No active delivery'}
                    </td>
                    <td>
                      <button type="button" onClick={() => selectRider(rider.rider_id)}>
                        View rider
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!visibleRiders.length && !refreshing && (
            <p className="user-empty-state">No matching riders.</p>
          )}
        </div>
      </div>
    </div>
  )
}
