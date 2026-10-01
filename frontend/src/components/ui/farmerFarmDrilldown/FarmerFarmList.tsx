import type { EntityRecord, FarmerFarm } from '../../../types/dashboard'

type FarmerFarmListProps = {
  farmer: EntityRecord
  farms: FarmerFarm[]
  selectedFarm: FarmerFarm | null
  onApproveFarmer: () => Promise<void>
  onOpenVerification: () => void
  onSelectFarm: (farmId: string) => void
  onCloseImageGallery: () => void
}

export function FarmerFarmList({
  farmer,
  farms,
  selectedFarm,
  onApproveFarmer,
  onOpenVerification,
  onSelectFarm,
  onCloseImageGallery,
}: FarmerFarmListProps) {
  const isVerified = farmer.status === 'Verified'
  return (
    <div className="farm-card-list" aria-label="Registered farms">
      <section className="farmer-review-actions" aria-label="Farmer review actions">
        <span className="management-count">PROFILE REVIEW</span>
        <strong>{isVerified ? 'Profile approved' : 'Review required'}</strong>
        <p>
          {isVerified
            ? 'This farmer can sell through Agrisell.'
            : 'Confirm the profile or request missing verification details.'}
        </p>
        <div>
          <button
            className="farmer-approve-button"
            type="button"
            onClick={() => void onApproveFarmer().catch(() => undefined)}
            disabled={isVerified}
          >
            {isVerified ? 'Approved' : 'Approve farmer'}
          </button>
          <button className="farmer-request-info-button" type="button" onClick={onOpenVerification}>
            Review / request information
          </button>
        </div>
      </section>
      {farms.map((farm) => (
        <button
          className={`farm-card ${selectedFarm?.id === farm.id ? 'is-selected' : ''}`}
          key={farm.id}
          type="button"
          onClick={() => {
            onSelectFarm(farm.id)
            onCloseImageGallery()
          }}
          aria-pressed={selectedFarm?.id === farm.id}
        >
          <span className="farm-card-copy">
            <span className={`status ${farm.tone}`}>
              <i aria-hidden="true" />
              {farm.status}
            </span>
            <strong>{farm.farmName}</strong>
            <small>{farm.farmLocation}</small>
            <span>
              {farm.farmSizeHectares} hectares - {farm.totalCrops} crops
            </span>
          </span>
          {farm.farmImages[0] && (
            <span className="farm-card-thumbnail" aria-hidden="true">
              <img src={farm.farmImages[0].imageUrl} alt="" />
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
