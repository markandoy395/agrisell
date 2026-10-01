import type { FarmerFarm } from '../../../types/dashboard'
import { FarmerFarmGallery } from './FarmerFarmGallery'
import { FarmParcelMap } from './FarmParcelMap'

type FarmerFarmDetailProps = {
  farm: FarmerFarm | null
  isImageGalleryOpen: boolean
  onOpenImageGallery: () => void
  onCloseImageGallery: () => void
}

const visibleImageLimit = 4
const mapUrl = (farm: FarmerFarm) =>
  `https://www.google.com/maps/search/?api=1&query=${farm.gpsLat},${farm.gpsLong}`

export function FarmerFarmDetail({
  farm,
  isImageGalleryOpen,
  onOpenImageGallery,
  onCloseImageGallery,
}: FarmerFarmDetailProps) {
  if (!farm) {
    return (
      <div className="farm-location-detail">
        <div className="farm-location-empty">
          Select a farm to display its map pin and farm images.
        </div>
      </div>
    )
  }
  const visibleImages = farm.farmImages.slice(0, visibleImageLimit)
  const hiddenImageCount = Math.max(farm.farmImages.length - visibleImageLimit, 0)

  return (
    <div className="farm-location-detail">
      <div className="farm-location-header">
        <div>
          <span className="management-count">GPS PINPOINT & GEOFENCE</span>
          <h4>{farm.farmName}</h4>
          <p>
            {farm.gpsLat.toFixed(4)}, {farm.gpsLong.toFixed(4)} · {farm.farmSizeHectares} ha
          </p>
        </div>
        <a className="map-link" href={mapUrl(farm)} target="_blank" rel="noreferrer">
          Open Google Maps
        </a>
      </div>
      <div className="farm-map-media">
        <div className="farm-map-interactive-wrap">
          <FarmParcelMap
            farms={[farm]}
            selectedFarmId={farm.id}
            miniMode={true}
            showControls={true}
          />
        </div>

        {farm.farmImages.length > 0 && (
          <div
            className={`farm-featured-image image-count-${visibleImages.length}`}
            aria-label={`${farm.farmName} farm images`}
          >
            {visibleImages.map((image, index) => {
              const moreCount = index === visibleImageLimit - 1 ? hiddenImageCount : 0
              return (
                <button
                  className={
                    moreCount > 0 ? 'farm-featured-tile has-more-images' : 'farm-featured-tile'
                  }
                  key={`${image.title}-${index}`}
                  type="button"
                  onClick={onOpenImageGallery}
                  aria-label={
                    moreCount > 0
                      ? `View all ${farm.farmImages.length} images for ${farm.farmName}`
                      : `View ${image.title} for ${farm.farmName}`
                  }
                >
                  <img src={image.imageUrl} alt="" />
                  {moreCount > 0 && (
                    <span className="farm-image-more" aria-label={`${moreCount} more farm images`}>
                      +{moreCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <dl className="farm-spec-grid">
        <div>
          <dt>Farming type</dt>
          <dd>{farm.farmingType}</dd>
        </div>
        <div>
          <dt>Soil type</dt>
          <dd>{farm.soilType}</dd>
        </div>
        <div>
          <dt>Irrigation</dt>
          <dd>{farm.irrigationType}</dd>
        </div>
        <div>
          <dt>Certifications</dt>
          <dd>
            {farm.certifications.length > 0
              ? farm.certifications.join(', ')
              : 'No certifications listed'}
          </dd>
        </div>
      </dl>
      <div className="farm-commodity-list">
        {farm.commodities.map((commodity) => (
          <span key={commodity}>{commodity}</span>
        ))}
      </div>
      {isImageGalleryOpen && <FarmerFarmGallery farm={farm} onClose={onCloseImageGallery} />}
    </div>
  )
}
