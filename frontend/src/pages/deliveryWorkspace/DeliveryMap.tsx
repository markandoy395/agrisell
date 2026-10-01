import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Map as MapInstance, Marker, GeoJSONSource } from 'maplibre-gl'
import { Icon } from '../../components/ui/icon/Icon'
import 'maplibre-gl/dist/maplibre-gl.css'

export type MapPin = {
  id: string
  name: string
  latitude: number
  longitude: number
  kind: 'rider' | 'pickup' | 'destination' | 'history'
  stale?: boolean
}
type Props = {
  pins: MapPin[]
  selectedPin?: string
  onSelect?: (id: string) => void
  line?: number[][]
  follow?: boolean
  searchControl?: ReactNode
  followControl?: ReactNode
  routeMode?: boolean
  onRefreshRoute?: () => void
  refreshingRoute?: boolean
  routeAvailable?: boolean
}
export function DeliveryMap({
  pins,
  selectedPin,
  onSelect,
  line = [],
  follow = false,
  searchControl,
  followControl,
  routeMode = false,
  onRefreshRoute,
  refreshingRoute = false,
  routeAvailable = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | null>(null)
  const markers = useRef<Marker[]>([])
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const fitted = useRef(false)
  useEffect(() => {
    let disposed = false
    void import('maplibre-gl')
      .then((lib) => {
        if (disposed || !container.current) return
        const instance = new lib.Map({
          container: container.current,
          center: [121, 14.6],
          zoom: 6,
          maxZoom: 19,
          style: {
            version: 8,
            sources: {
              osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                maxzoom: 19,
                attribution:
                  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
              },
            },
            layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
          },
        })
        map.current = instance
        instance.addControl(new lib.NavigationControl(), 'top-right')
        instance.on('load', () => {
          instance.addSource('route', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          })
          instance.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: { 'line-color': '#0a8643', 'line-width': 5, 'line-opacity': 0.8 },
          })
          if (!disposed) setReady(true)
        })
        instance.on('error', () => {
          if (!disposed)
            setMapError(
              'Some map tiles could not load. Rider coordinates are still available below.',
            )
        })
        const observer = new ResizeObserver(() => instance.resize())
        observer.observe(container.current)
        instance.once('remove', () => observer.disconnect())
      })
      .catch(() => {
        if (!disposed) setMapError('The map could not start. Use the delivery details below.')
      })
    return () => {
      disposed = true
      markers.current.forEach((marker) => marker.remove())
      map.current?.remove()
      map.current = null
    }
  }, [])
  useEffect(() => {
    if (!ready || !map.current) return
    let disposed = false
    void import('maplibre-gl').then((lib) => {
      if (disposed || !map.current) return
      markers.current.forEach((marker) => marker.remove())
      markers.current = pins.map((pin) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `delivery-map-marker ${pin.kind} ${pin.stale ? 'stale' : ''} ${selectedPin === pin.id ? 'selected' : ''}`
        button.textContent =
          pin.kind === 'pickup'
            ? 'P'
            : pin.kind === 'destination'
              ? 'D'
              : pin.kind === 'history'
                ? 'H'
                : 'R'
        button.title = pin.name
        button.setAttribute('aria-label', pin.name)
        button.addEventListener('click', () => onSelect?.(pin.id))
        return new lib.Marker({ element: button })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map.current!)
      })
      if (!fitted.current && pins.length) {
        const bounds = new lib.LngLatBounds()
        pins.forEach((pin) => bounds.extend([pin.longitude, pin.latitude]))
        map.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 })
        fitted.current = true
      }
    })
    return () => {
      disposed = true
    }
  }, [onSelect, pins, ready, selectedPin])
  useEffect(() => {
    if (!ready || !map.current) return
    ;(map.current.getSource('route') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features:
        line.length > 1
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: line },
              },
            ]
          : [],
    })
  }, [line, ready])
  useEffect(() => {
    const pin = pins.find((p) => p.id === selectedPin)
    if (follow && pin && ready)
      map.current?.easeTo({ center: [pin.longitude, pin.latitude], zoom: 15, duration: 500 })
  }, [follow, pins, ready, selectedPin])
  const fit = async () => {
    if (!map.current || !pins.length) return
    const lib = await import('maplibre-gl')
    const bounds = new lib.LngLatBounds()
    pins.forEach((p) => bounds.extend([p.longitude, p.latitude]))
    map.current?.fitBounds(bounds, { padding: 60, maxZoom: 15 })
  }
  if (routeMode)
    return (
      <div className="delivery-map-shell delivery-route-map-shell">
        <div className="delivery-map-panel">
          <div className="delivery-route-map-actions">
            <button
              type="button"
              disabled={!pins.length || !ready}
              onClick={() => {
                void fit()
              }}
            >
              <Icon name="route" size={18} />
              Center route
            </button>
            <button
              type="button"
              disabled={refreshingRoute || !routeAvailable}
              onClick={onRefreshRoute}
            >
              <Icon name="refresh" size={18} />
              {refreshingRoute ? 'Refreshing…' : 'Refresh route'}
            </button>
          </div>
          <div ref={container} className="delivery-live-map" aria-label="Delivery route map" />
          <div className="delivery-route-map-legend">
            <span>
              <i className="pickup" />
              Pickup
            </span>
            <span>
              <i className="destination" />
              Destination
            </span>
            <span>
              <i className="route" />
              Route
            </span>
          </div>
          {mapError && <p role="status">{mapError}</p>}
        </div>
      </div>
    )
  return (
    <div className="delivery-map-shell">
      <div className="delivery-map-tools">
        {searchControl}
        <div className="delivery-map-legend">
          <span className="is-rider">
            <b>●</b> Rider
          </span>
          <span>
            <b>P</b> Pickup
          </span>
          <span>
            <b>D</b> Destination
          </span>
          <span>Gray: stale GPS</span>
          <button
            type="button"
            disabled={!pins.length || !ready}
            onClick={() => {
              void fit()
            }}
          >
            <Icon name="route" size={17} />
            Fit all markers
          </button>
        </div>
      </div>
      {followControl}
      <div className="delivery-map-panel">
        <div ref={container} className="delivery-live-map" aria-label="Interactive delivery map" />
        {mapError && <p role="status">{mapError}</p>}
      </div>
    </div>
  )
}
