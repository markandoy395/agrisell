import { useEffect, useRef, useState } from 'react'
import type { Map as MapInstance, Marker, Popup } from 'maplibre-gl'
import type { FarmerFarm } from '../../../types/dashboard'
import { Icon } from '../icon/Icon'
import {
  computeFarmsBoundingBox,
  computeParcelGeofence,
  formatCoordinates,
  isValidCoordinate,
} from './farmParcelMap.utils'
import 'maplibre-gl/dist/maplibre-gl.css'
import './FarmParcelMap.css'

type FarmParcelMapProps = {
  farms: FarmerFarm[]
  selectedFarmId?: string | null
  onSelectFarm?: (farmId: string) => void
  className?: string
  interactive?: boolean
  showControls?: boolean
  miniMode?: boolean
}

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export function FarmParcelMap({
  farms,
  selectedFarmId,
  onSelectFarm,
  className = '',
  interactive = true,
  showControls = true,
  miniMode = false,
}: FarmParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const markersRef = useRef<Marker[]>([])
  const popupRef = useRef<Popup | null>(null)

  const [isMapReady, setIsMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [showGeofences, setShowGeofences] = useState(true)
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets')

  const validFarms = farms.filter((farm) => isValidCoordinate(farm.gpsLat, farm.gpsLong))

  // Initialize MapLibre
  useEffect(() => {
    let disposed = false
    void import('maplibre-gl').then((lib) => {
      if (disposed || !containerRef.current) return

      // Default center (Philippines archipelago center or first farm)
      const defaultCenter: [number, number] = validFarms.length > 0
        ? [validFarms[0].gpsLong, validFarms[0].gpsLat]
        : [121.774, 12.8797]

      const defaultZoom = validFarms.length > 0 ? (miniMode ? 14 : 12) : 5

      const instance = new lib.Map({
        container: containerRef.current,
        center: defaultCenter,
        zoom: defaultZoom,
        maxZoom: 19,
        minZoom: 3,
        style: {
          version: 8,
          sources: {
            baseTiles: {
              type: 'raster',
              tiles: [mapStyle === 'satellite' ? SATELLITE_TILES : OSM_TILES],
              tileSize: 256,
              maxzoom: 19,
              attribution: '© OpenStreetMap contributors | ESRI World Imagery',
            },
          },
          layers: [{ id: 'base-tiles', type: 'raster', source: 'baseTiles' }],
        },
      })

      mapRef.current = instance

      if (interactive && !miniMode) {
        instance.addControl(new lib.NavigationControl({ showCompass: true }), 'top-right')
      }

      instance.on('load', () => {
        if (disposed) return

        // Add parcels GeoJSON source
        instance.addSource('parcels', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        // Geofence fill
        instance.addLayer({
          id: 'parcels-fill',
          type: 'fill',
          source: 'parcels',
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['get', 'isSelected'], false],
              '#15803d',
              '#10b981',
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['get', 'isSelected'], false],
              0.35,
              0.2,
            ],
          },
        })

        // Geofence boundary line
        instance.addLayer({
          id: 'parcels-line',
          type: 'line',
          source: 'parcels',
          paint: {
            'line-color': [
              'case',
              ['boolean', ['get', 'isSelected'], false],
              '#047857',
              '#059669',
            ],
            'line-width': [
              'case',
              ['boolean', ['get', 'isSelected'], false],
              3.5,
              2,
            ],
            'line-dasharray': [3, 2],
          },
        })

        setIsMapReady(true)
      })

      instance.on('error', () => {
        if (!disposed) setMapError('Some map tiles could not load.')
      })

      const resizeObserver = new ResizeObserver(() => instance.resize())
      resizeObserver.observe(containerRef.current)
      instance.once('remove', () => resizeObserver.disconnect())
    })

    return () => {
      disposed = true
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      popupRef.current?.remove()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Swap Map Style (Standard vs Satellite)
  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map) return

    const tileUrl = mapStyle === 'satellite' ? SATELLITE_TILES : OSM_TILES
    const source = map.getSource('baseTiles') as unknown as { setTiles?: (tiles: string[]) => void }
    if (source && typeof source.setTiles === 'function') {
      source.setTiles([tileUrl])
    }
  }, [mapStyle, isMapReady])

  // Toggle Geofences Visibility
  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map) return

    const visibility = showGeofences ? 'visible' : 'none'
    if (map.getLayer('parcels-fill')) {
      map.setLayoutProperty('parcels-fill', 'visibility', visibility)
    }
    if (map.getLayer('parcels-line')) {
      map.setLayoutProperty('parcels-line', 'visibility', visibility)
    }
  }, [showGeofences, isMapReady])

  // Update GeoJSON Parcels and Markers
  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map) return

    let disposed = false
    void import('maplibre-gl').then((lib) => {
      if (disposed || !mapRef.current) return

      // 1. Update Parcels GeoJSON source
      const features = validFarms.map((farm) => {
        const ring = computeParcelGeofence(farm.gpsLat, farm.gpsLong, farm.farmSizeHectares)
        return {
          type: 'Feature' as const,
          properties: {
            id: farm.id,
            farmName: farm.farmName,
            hectares: farm.farmSizeHectares,
            isSelected: farm.id === selectedFarmId,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [ring],
          },
        }
      })

      const parcelsSource = map.getSource('parcels') as unknown as {
        setData?: (data: unknown) => void
      }
      if (parcelsSource && typeof parcelsSource.setData === 'function') {
        parcelsSource.setData({
          type: 'FeatureCollection',
          features,
        })
      }

      // 2. Remove old markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      // 3. Create fresh interactive markers
      markersRef.current = validFarms.map((farm) => {
        const isSelected = farm.id === selectedFarmId

        const el = document.createElement('div')
        el.className = `farm-parcel-marker${isSelected ? ' is-selected' : ''}`
        el.setAttribute('tabindex', '0')
        el.setAttribute('role', 'button')
        el.setAttribute('aria-label', `Farm: ${farm.farmName}`)

        el.innerHTML = `
          <div class="marker-pin-pin">
            <span class="marker-pin-icon">🌾</span>
            <span class="marker-pin-hectares">${farm.farmSizeHectares} ha</span>
          </div>
          <div class="marker-pin-label">${farm.farmName}</div>
        `

        const marker = new lib.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([farm.gpsLong, farm.gpsLat])
          .addTo(map)

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          if (onSelectFarm) onSelectFarm(farm.id)

          // Fly to parcel on click
          map.flyTo({
            center: [farm.gpsLong, farm.gpsLat],
            zoom: Math.max(map.getZoom(), 14.5),
            duration: 900,
          })

          // Show interactive popup
          popupRef.current?.remove()
          const cropsHtml = farm.mainCrops.length > 0
            ? `<div class="parcel-popup-crops">${farm.mainCrops.map((c) => `<span class="crop-tag">${c}</span>`).join('')}</div>`
            : ''

          const popupContent = `
            <div class="farm-parcel-popup">
              <div class="parcel-popup-header">
                <span class="parcel-badge">Registered Farm Parcel</span>
                <h4>${farm.farmName}</h4>
                <p class="parcel-popup-coords">${formatCoordinates(farm.gpsLat, farm.gpsLong)}</p>
              </div>
              <div class="parcel-popup-stats">
                <div><span>Size:</span> <strong>${farm.farmSizeHectares} ha</strong></div>
                <div><span>Farming:</span> <strong>${farm.farmingType || 'Standard'}</strong></div>
                <div><span>Soil:</span> <strong>${farm.soilType || 'Loam'}</strong></div>
              </div>
              ${cropsHtml}
              <div class="parcel-popup-actions">
                <a href="https://www.google.com/maps/search/?api=1&query=${farm.gpsLat},${farm.gpsLong}"
                   target="_blank" rel="noreferrer" class="parcel-external-link">
                  Open Google Maps
                </a>
              </div>
            </div>
          `

          const popup = new lib.Popup({ offset: [0, -38], closeButton: true })
            .setLngLat([farm.gpsLong, farm.gpsLat])
            .setHTML(popupContent)
            .addTo(map)

          popupRef.current = popup
        })

        return marker
      })
    })

    return () => {
      disposed = true
    }
  }, [validFarms.length, selectedFarmId, isMapReady])

  // Center on selected farm or fit all parcels
  const handleFitAll = () => {
    const map = mapRef.current
    if (!map || validFarms.length === 0) return

    if (validFarms.length === 1) {
      map.flyTo({
        center: [validFarms[0].gpsLong, validFarms[0].gpsLat],
        zoom: 14.5,
        duration: 800,
      })
      return
    }

    const bbox = computeFarmsBoundingBox(validFarms)
    if (!bbox) return

    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: miniMode ? 30 : 60, maxZoom: 16, duration: 1000 },
    )
  }

  // Auto-focus when selectedFarmId changes
  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || !selectedFarmId) return

    const selectedFarm = validFarms.find((f) => f.id === selectedFarmId)
    if (selectedFarm) {
      map.flyTo({
        center: [selectedFarm.gpsLong, selectedFarm.gpsLat],
        zoom: Math.max(map.getZoom(), 14.5),
        duration: 900,
      })
    }
  }, [selectedFarmId, isMapReady])

  // Initial fit bounds when map loads
  useEffect(() => {
    if (!isMapReady || validFarms.length === 0) return
    handleFitAll()
  }, [isMapReady])

  return (
    <div className={`farm-parcel-map-container ${className}${miniMode ? ' is-mini' : ''}`}>
      <div ref={containerRef} className="farm-parcel-map-canvas" />

      {mapError && (
        <div className="farm-map-error-banner" role="alert">
          <Icon name="info" size={14} />
          <span>{mapError}</span>
        </div>
      )}

      {showControls && (
        <div className="farm-parcel-map-controls">
          <button
            type="button"
            className="map-control-btn"
            onClick={handleFitAll}
            title="Fit all farm parcels into view"
          >
            <Icon name="route" size={14} />
            <span>Fit All ({validFarms.length})</span>
          </button>

          <button
            type="button"
            className={`map-control-btn${showGeofences ? ' is-active' : ''}`}
            onClick={() => setShowGeofences((prev) => !prev)}
            title="Toggle estimated parcel geofence boundaries"
          >
            <Icon name="shield" size={14} />
            <span>Geofence</span>
          </button>

          <button
            type="button"
            className={`map-control-btn${mapStyle === 'satellite' ? ' is-active' : ''}`}
            onClick={() => setMapStyle((s) => (s === 'streets' ? 'satellite' : 'streets'))}
            title="Toggle Satellite vs Street base map"
          >
            <Icon name="eye" size={14} />
            <span>{mapStyle === 'satellite' ? 'Satellite' : 'Street'}</span>
          </button>
        </div>
      )}

      {validFarms.length === 0 && (
        <div className="farm-parcel-map-empty-overlay">
          <Icon name="alert" size={20} />
          <span>No GPS coordinates registered for this farmer's parcels.</span>
        </div>
      )}
    </div>
  )
}
