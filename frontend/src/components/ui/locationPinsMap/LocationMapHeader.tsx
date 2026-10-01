import type { LocationPin } from '../../../types/dashboard'

export function LocationMapHeader({
  description,
  pins,
  title,
}: {
  description: string
  pins: LocationPin[]
  title: string
}) {
  const userCount = pins.filter((pin) => pin.kind !== 'farm').length
  const riderMap = pins.every((pin) => pin.kind === 'rider')
  return (
    <div className="location-map-copy">
      <div>
        <span className="management-count">ADMIN MAP</span>
        <h3 id="location-map-title">{title}</h3>
        <p>{description}</p>
      </div>
      <div className="location-map-stats" aria-label="Map pin totals">
        <span>
          <strong>{pins.length}</strong>Total pins
        </span>
        {!riderMap && (
          <span>
            <strong>{userCount}</strong>Users
          </span>
        )}
        {!riderMap && (
          <span>
            <strong>{pins.length - userCount}</strong>Farm pins
          </span>
        )}
      </div>
    </div>
  )
}
