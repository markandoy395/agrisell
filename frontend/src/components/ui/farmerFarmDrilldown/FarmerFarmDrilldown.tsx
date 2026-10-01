import { useEffect, useState } from 'react'
import type { EntityRecord, FarmerFarm } from '../../../types/dashboard'
import { Icon } from '../icon/Icon'
import { FarmerFarmDetail } from './FarmerFarmDetail'
import { FarmerFarmList } from './FarmerFarmList'
import { FarmerFarmParcelSidebar } from './FarmerFarmParcelSidebar'
import { FarmParcelMap } from './FarmParcelMap'
import { computeFarmStats } from './farmParcelMap.utils'
import './FarmerFarmDrilldown.css'

type FarmerFarmDrilldownProps = {
  farmer: EntityRecord
  farms: FarmerFarm[]
  selectedFarmId: string | null
  isImageGalleryOpen: boolean
  onSelectFarm: (farmId: string) => void
  onClearSelection: () => void
  onOpenImageGallery: () => void
  onCloseImageGallery: () => void
  onApproveFarmer: () => Promise<void>
  onOpenVerification: () => void
}

export function FarmerFarmDrilldown(props: FarmerFarmDrilldownProps) {
  const { isImageGalleryOpen, onCloseImageGallery } = props
  const [viewMode, setViewMode] = useState<'map' | 'cards'>('map')

  const selectedFarm = props.farms.find((farm) => farm.id === props.selectedFarmId) ?? null
  const stats = computeFarmStats(props.farms)

  useEffect(() => {
    if (!isImageGalleryOpen) return
    const closeGalleryOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseImageGallery()
    }
    window.addEventListener('keydown', closeGalleryOnEscape)
    return () => window.removeEventListener('keydown', closeGalleryOnEscape)
  }, [isImageGalleryOpen, onCloseImageGallery])

  return (
    <article className="farmer-farms-panel" aria-labelledby="farmer-farms-title">
      <div className="farmer-farms-heading">
        <div>
          <span className="management-count">FARMER · PARCELS & GEOFENCES · COMMODITIES</span>
          <h3 id="farmer-farms-title">{props.farmer.primary}'s registered farms</h3>
          <p>
            Review geographic coordinates, parcel coverage geofences, farm infrastructure photos,
            and registered crops.
          </p>

          {/* Quick Aggregate Stats Bar */}
          {props.farms.length > 0 && (
            <div className="farmer-parcels-stats-bar">
              <span className="parcels-stat-item">
                <Icon name="tag" size={13} />
                <strong>{stats.totalFarms}</strong> parcels
              </span>
              <span className="parcels-stat-item">
                <Icon name="sprout" size={13} />
                <strong>{stats.totalHectares}</strong> total hectares
              </span>
              <span className="parcels-stat-item">
                <Icon name="basket" size={13} />
                <strong>{stats.uniqueCropsCount}</strong> crops grown
              </span>
              <span className="parcels-stat-item">
                <Icon name="route" size={13} />
                <strong>{stats.validGpsCount}/{stats.totalFarms}</strong> geocoded
              </span>
            </div>
          )}
        </div>

        <div className="farmer-farms-heading-actions">
          {/* View Mode Toggle */}
          {props.farms.length > 0 && (
            <div className="farm-view-mode-toggle" role="group" aria-label="Farm View Mode">
              <button
                type="button"
                className={`view-mode-btn${viewMode === 'map' ? ' is-active' : ''}`}
                onClick={() => setViewMode('map')}
                title="Geographic Map & Geofence View"
              >
                <Icon name="route" size={14} />
                <span>Parcel Map</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn${viewMode === 'cards' ? ' is-active' : ''}`}
                onClick={() => setViewMode('cards')}
                title="Cards & Photo Gallery View"
              >
                <Icon name="grid" size={14} />
                <span>Cards & Photos</span>
              </button>
            </div>
          )}

          <button className="filter-button" type="button" onClick={props.onClearSelection}>
            Clear selection
          </button>
        </div>
      </div>

      {props.farms.length > 0 ? (
        viewMode === 'map' ? (
          /* Interactive Geographic Parcel & Geofence Map View */
          <div className="farm-map-layout-grid">
            <FarmerFarmParcelSidebar
              farms={props.farms}
              selectedFarmId={props.selectedFarmId}
              onSelectFarm={props.onSelectFarm}
              onOpenGallery={props.onOpenImageGallery}
            />
            <div className="farm-map-canvas-pane">
              <FarmParcelMap
                farms={props.farms}
                selectedFarmId={props.selectedFarmId}
                onSelectFarm={props.onSelectFarm}
                interactive={true}
                showControls={true}
              />
            </div>
          </div>
        ) : (
          /* Traditional Cards & Photo Gallery View */
          <div className="farm-drilldown-grid">
            <FarmerFarmList
              farmer={props.farmer}
              farms={props.farms}
              selectedFarm={selectedFarm}
              onApproveFarmer={props.onApproveFarmer}
              onOpenVerification={props.onOpenVerification}
              onSelectFarm={props.onSelectFarm}
              onCloseImageGallery={props.onCloseImageGallery}
            />
            <FarmerFarmDetail
              farm={selectedFarm}
              isImageGalleryOpen={props.isImageGalleryOpen}
              onOpenImageGallery={props.onOpenImageGallery}
              onCloseImageGallery={props.onCloseImageGallery}
            />
          </div>
        )
      ) : (
        <div className="farm-location-empty">No farms are registered to this farmer yet.</div>
      )}
    </article>
  )
}
