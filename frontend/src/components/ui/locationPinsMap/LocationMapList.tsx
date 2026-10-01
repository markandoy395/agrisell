import type { LocationPin } from '../../../types/dashboard'
import { getPinTypeLabel } from './locationPinsMap.utils'

export function LocationMapList({
  pins,
  selectedId,
  onSelect,
}: {
  pins: LocationPin[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="location-map-list" aria-label="All map pins">
      {pins.map((pin) => (
        <button
          className={selectedId === pin.id ? 'is-selected' : ''}
          key={pin.id}
          type="button"
          onClick={() => onSelect(pin.id)}
        >
          <span className={`location-pin-dot location-pin-${pin.kind}`} />
          <span>
            <strong>{pin.label}</strong>
            <small>{pin.owner}</small>
          </span>
          <em>{getPinTypeLabel(pin)}</em>
        </button>
      ))}
    </div>
  )
}
