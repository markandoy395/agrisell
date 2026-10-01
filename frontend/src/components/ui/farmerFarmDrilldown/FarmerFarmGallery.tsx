import type { FarmerFarm } from '../../../types/dashboard'
import { CloseButton } from '../closeButton/CloseButton'

type FarmerFarmGalleryProps = {
  farm: FarmerFarm
  onClose: () => void
}

export function FarmerFarmGallery({ farm, onClose }: FarmerFarmGalleryProps) {
  return (
    <div
      className="farm-gallery-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="farm-gallery-title"
    >
      <button
        className="farm-gallery-backdrop"
        type="button"
        onClick={onClose}
        aria-label="Close farm image gallery"
      />
      <div className="farm-gallery-dialog">
        <div className="farm-gallery-header">
          <div>
            <span className="management-count">FARM IMAGES</span>
            <h5 id="farm-gallery-title">{farm.farmName}</h5>
          </div>
          <CloseButton label="Close farm image gallery" onClick={onClose} />
        </div>
        <div className="farm-gallery-grid">
          {farm.farmImages.map((image, index) => (
            <figure key={`${image.title}-gallery-${index}`}>
              <img src={image.imageUrl} alt={image.alt} />
              <figcaption>{image.title}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
