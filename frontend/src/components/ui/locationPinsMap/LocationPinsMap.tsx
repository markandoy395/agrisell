import { LocationMapCanvas } from './LocationMapCanvas'
import { LocationMapHeader } from './LocationMapHeader'
import { LocationMapList } from './LocationMapList'
import type { LocationPinsMapProps } from './locationPinsMap.types'
import { useLocationPinsMap } from './useLocationPinsMap'
import './LocationPinsMap.css'

export function LocationPinsMap({ title, description, pins }: LocationPinsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const state = useLocationPinsMap(pins, mapRef)
  if (!pins.length) return null
  return (
    <section className="location-map-panel" aria-labelledby="location-map-title">
      <LocationMapHeader description={description} pins={pins} title={title} />
      <div className="location-map-layout">
        <LocationMapCanvas mapRef={mapRef} state={state} title={title} />
        <LocationMapList
          pins={pins}
          selectedId={state.selectedPin?.id}
          onSelect={state.setSelectedPinId}
        />
      </div>
    </section>
  )
}
import { useRef } from 'react'
