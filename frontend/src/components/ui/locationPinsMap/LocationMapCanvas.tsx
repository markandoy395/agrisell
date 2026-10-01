import type { RefObject } from 'react'
import type { LocationPinsMapState } from './useLocationPinsMap'
import { getGoogleMapUrl, getPinTypeLabel, MAX_ZOOM, MIN_ZOOM } from './locationPinsMap.utils'

export function LocationMapCanvas({
  mapRef,
  state,
  title,
}: {
  mapRef: RefObject<HTMLDivElement | null>
  state: LocationPinsMapState
  title: string
}) {
  return (
    <div
      className="location-map-canvas"
      ref={mapRef}
      role="application"
      tabIndex={0}
      aria-label={title}
      onDoubleClick={() => state.adjustZoom(1)}
      onKeyDown={state.handleKeyDown}
    >
      <div className="location-map-tiles" aria-hidden="true">
        {state.tiles.map((tile) => (
          <img
            className="location-map-tile"
            draggable="false"
            key={tile.key}
            loading="lazy"
            src={tile.src}
            style={tile.style}
            alt=""
          />
        ))}
      </div>
      <div className="location-map-controls" aria-label="Map zoom controls">
        <button
          type="button"
          onClick={() => state.adjustZoom(1)}
          disabled={state.zoom >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => state.adjustZoom(-1)}
          disabled={state.zoom <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          -
        </button>
      </div>
      {state.plottedPins.map(({ pin, style }, index) => (
        <button
          className={`location-pin location-pin-${pin.kind} ${state.selectedPin?.id === pin.id ? 'is-selected' : ''}`}
          key={pin.id}
          type="button"
          style={style}
          onClick={() => state.setSelectedPinId(pin.id)}
          aria-label={`${getPinTypeLabel(pin)} ${pin.label}, ${pin.detail}`}
        >
          <span>{index + 1}</span>
        </button>
      ))}
      {state.selectedPin && (
        <article className="location-map-detail">
          <span className={`status ${state.selectedPin.tone}`}>
            <i />
            {state.selectedPin.status}
          </span>
          <strong>{state.selectedPin.label}</strong>
          <small>{state.selectedPin.owner}</small>
          <p>{state.selectedPin.detail}</p>
          <a href={getGoogleMapUrl(state.selectedPin)} target="_blank" rel="noreferrer">
            Open in Google Maps
          </a>
        </article>
      )}
      <a
        className="location-map-attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        &copy; OpenStreetMap contributors
      </a>
    </div>
  )
}
