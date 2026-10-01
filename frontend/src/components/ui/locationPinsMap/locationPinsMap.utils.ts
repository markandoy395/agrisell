import type { LocationPin } from '../../../types/dashboard'
import type { MapSize, MapTile, ProjectedPoint } from './locationPinsMap.types'

export const TILE_SIZE = 256
export const MIN_ZOOM = 7
export const MAX_ZOOM = 12
export const DEFAULT_MAP_SIZE: MapSize = { width: 760, height: 360 }
export const PIN_JITTER = [
  [0, 0],
  [8, -6],
  [-8, 6],
  [9, 7],
  [-9, -5],
  [4, 9],
] as const

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const getProjectedPoint = (
  gpsLat: number,
  gpsLong: number,
  zoom: number,
): ProjectedPoint => {
  const latRad = (gpsLat * Math.PI) / 180
  const sinLat = clamp(Math.sin(latRad), -0.9999, 0.9999)
  const scale = TILE_SIZE * 2 ** zoom
  return {
    x: ((gpsLong + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  }
}

export const getMapCenter = (pins: LocationPin[]) => {
  if (!pins.length) return { gpsLat: 0, gpsLong: 0 }
  const latitudes = pins.map((pin) => pin.gpsLat)
  const longitudes = pins.map((pin) => pin.gpsLong)
  return {
    gpsLat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    gpsLong: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  }
}

export const getBaseZoom = (pins: LocationPin[], size: MapSize) => {
  if (!pins.length) return MIN_ZOOM
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const points = pins.map((pin) => getProjectedPoint(pin.gpsLat, pin.gpsLong, zoom))
    const xValues = points.map((point) => point.x)
    const yValues = points.map((point) => point.y)
    const width = Math.max(...xValues) - Math.min(...xValues)
    const height = Math.max(...yValues) - Math.min(...yValues)
    if (width <= size.width * 0.78 && height <= size.height * 0.62) return zoom
  }
  return MIN_ZOOM
}

export const createMapTiles = (zoom: number, topLeft: ProjectedPoint, size: MapSize): MapTile[] => {
  const tileCount = 2 ** zoom
  const startX = Math.floor(topLeft.x / TILE_SIZE)
  const endX = Math.floor((topLeft.x + size.width) / TILE_SIZE)
  const startY = Math.floor(topLeft.y / TILE_SIZE)
  const endY = Math.floor((topLeft.y + size.height) / TILE_SIZE)
  const tiles: MapTile[] = []
  for (let tileX = startX; tileX <= endX; tileX += 1) {
    const wrappedX = ((tileX % tileCount) + tileCount) % tileCount
    for (let tileY = startY; tileY <= endY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue
      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
        style: {
          left: `${tileX * TILE_SIZE - topLeft.x}px`,
          top: `${tileY * TILE_SIZE - topLeft.y}px`,
        },
      })
    }
  }
  return tiles
}

export const getPinTypeLabel = (pin: LocationPin) => {
  if (pin.kind === 'rider') return 'Rider'
  if (pin.kind === 'farm') return 'Farm pin'
  if (pin.kind === 'farmer') return 'Farmer'
  return 'User'
}

export const getGoogleMapUrl = (pin: LocationPin) =>
  `https://www.google.com/maps/search/?api=1&query=${pin.gpsLat},${pin.gpsLong}`
