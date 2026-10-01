import type { FarmerFarm } from '../../../types/dashboard'
import { Icon } from '../icon/Icon'
import { formatCoordinates, isValidCoordinate } from './farmParcelMap.utils'
import './FarmerFarmParcelSidebar.css'

type FarmerFarmParcelSidebarProps = {
  farms: FarmerFarm[]
  selectedFarmId: string | null
  onSelectFarm: (farmId: string) => void
  onOpenGallery: () => void
}

export function FarmerFarmParcelSidebar({
  farms,
  selectedFarmId,
  onSelectFarm,
  onOpenGallery,
}: FarmerFarmParcelSidebarProps) {
  return (
    <aside className="farm-parcel-sidebar" aria-label="Registered Farm Parcels">
      <div className="parcel-sidebar-header">
        <span className="parcel-sidebar-title">
          <Icon name="tag" size={14} /> Registered Parcels ({farms.length})
        </span>
        <span className="parcel-sidebar-sub">Click a parcel to fly to coordinates</span>
      </div>

      <div className="parcel-card-list">
        {farms.map((farm) => {
          const isSelected = farm.id === selectedFarmId
          const hasCoords = isValidCoordinate(farm.gpsLat, farm.gpsLong)

          return (
            <article
              key={farm.id}
              className={`parcel-card${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelectFarm(farm.id)}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectFarm(farm.id)
                }
              }}
            >
              <div className="parcel-card-top">
                <strong className="parcel-card-name">{farm.farmName}</strong>
                <span className="parcel-card-size">{farm.farmSizeHectares} ha</span>
              </div>

              <div className="parcel-card-location">
                <Icon name="route" size={12} />
                <span>{farm.farmLocation || 'Location not specified'}</span>
              </div>

              <div className="parcel-card-meta">
                <span className={`coords-badge${hasCoords ? '' : ' no-coords'}`}>
                  {hasCoords ? formatCoordinates(farm.gpsLat, farm.gpsLong) : 'No GPS Set'}
                </span>
                <span className="farming-type-badge">{farm.farmingType || 'Standard'}</span>
              </div>

              {farm.mainCrops.length > 0 && (
                <div className="parcel-card-crops">
                  {farm.mainCrops.slice(0, 3).map((crop) => (
                    <span key={crop} className="crop-pill">
                      {crop}
                    </span>
                  ))}
                  {farm.mainCrops.length > 3 && (
                    <span className="crop-pill-more">+{farm.mainCrops.length - 3}</span>
                  )}
                </div>
              )}

              {isSelected && farm.farmImages.length > 0 && (
                <div className="parcel-card-actions">
                  <button
                    type="button"
                    className="parcel-action-gallery-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenGallery()
                    }}
                  >
                    <Icon name="camera" size={13} />
                    <span>View Photos ({farm.farmImages.length})</span>
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </aside>
  )
}
