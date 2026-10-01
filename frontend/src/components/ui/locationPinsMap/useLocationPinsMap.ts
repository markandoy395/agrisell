import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'
import type { LocationPin } from '../../../types/dashboard'
import type { MapSize, PlottedPin } from './locationPinsMap.types'
import {
  clamp,
  createMapTiles,
  DEFAULT_MAP_SIZE,
  getBaseZoom,
  getMapCenter,
  getProjectedPoint,
  MAX_ZOOM,
  MIN_ZOOM,
  PIN_JITTER,
} from './locationPinsMap.utils'

export function useLocationPinsMap(pins: LocationPin[], mapRef: RefObject<HTMLDivElement | null>) {
  const lastWheelZoomAtRef = useRef(0)
  const [mapSize, setMapSize] = useState<MapSize>(DEFAULT_MAP_SIZE)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(pins[0]?.id ?? null)
  const [zoomOffset, setZoomOffset] = useState(0)

  useEffect(() => {
    if (!mapRef.current) return
    const updateMapSize = () => {
      if (!mapRef.current) return
      const { width, height } = mapRef.current.getBoundingClientRect()
      setMapSize({ width: Math.max(Math.round(width), 1), height: Math.max(Math.round(height), 1) })
    }
    updateMapSize()
    const observer = new ResizeObserver(updateMapSize)
    observer.observe(mapRef.current)
    return () => observer.disconnect()
  }, [mapRef])

  const center = useMemo(() => getMapCenter(pins), [pins])
  const baseZoom = useMemo(() => getBaseZoom(pins, mapSize), [mapSize, pins])
  const zoom = clamp(baseZoom + zoomOffset, MIN_ZOOM, MAX_ZOOM)
  const centerPoint = useMemo(
    () => getProjectedPoint(center.gpsLat, center.gpsLong, zoom),
    [center.gpsLat, center.gpsLong, zoom],
  )
  const topLeft = useMemo(
    () => ({
      x: centerPoint.x - mapSize.width / 2,
      y: centerPoint.y - mapSize.height / 2,
    }),
    [centerPoint, mapSize],
  )
  const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? pins[0] ?? null
  const plottedPins = useMemo<PlottedPin[]>(
    () =>
      pins.map((pin, index) => {
        const point = getProjectedPoint(pin.gpsLat, pin.gpsLong, zoom)
        const [offsetX, offsetY] = PIN_JITTER[index % PIN_JITTER.length]
        return {
          pin,
          style: {
            left: `${point.x - topLeft.x + offsetX}px`,
            top: `${point.y - topLeft.y + offsetY}px`,
          },
        }
      }),
    [pins, topLeft, zoom],
  )
  const tiles = useMemo(() => createMapTiles(zoom, topLeft, mapSize), [mapSize, topLeft, zoom])
  const adjustZoom = useCallback(
    (change: number) => {
      setZoomOffset((current) => clamp(current + change, MIN_ZOOM - baseZoom, MAX_ZOOM - baseZoom))
    },
    [baseZoom],
  )
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      adjustZoom(1)
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      adjustZoom(-1)
    }
  }

  useEffect(() => {
    const mapElement = mapRef.current
    if (!mapElement) return
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 8) return
      event.preventDefault()
      event.stopPropagation()
      const now = Date.now()
      if (now - lastWheelZoomAtRef.current < 120) return
      lastWheelZoomAtRef.current = now
      adjustZoom(event.deltaY < 0 ? 1 : -1)
    }
    mapElement.addEventListener('wheel', handleWheel, { passive: false })
    return () => mapElement.removeEventListener('wheel', handleWheel)
  }, [adjustZoom, mapRef])

  return {
    adjustZoom,
    handleKeyDown,
    plottedPins,
    selectedPin,
    setSelectedPinId,
    tiles,
    zoom,
  }
}

export type LocationPinsMapState = ReturnType<typeof useLocationPinsMap>
