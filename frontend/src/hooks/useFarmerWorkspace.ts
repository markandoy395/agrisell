import { useMemo, useState } from 'react'
import type { EntityRecord, FarmerFarm } from '../types/dashboard'
import { downloadFarmersCsv } from '../utils/farmerCsv'
import { getFirstFarmIdForFarmer } from '../utils/farmerWorkspace'
import { createFarmerSummaryCards } from './farmerWorkspaceSummary'
import { useFarmerFilters } from './useFarmerFilters'

type UseFarmerWorkspaceParams = {
  farmers: EntityRecord[]
  farms: FarmerFarm[]
  search: string
  created: EntityRecord[]
  onOpen: (record: EntityRecord) => void
  onReviewAction: (
    action: 'approved' | 'requested-information',
    farmer: EntityRecord,
  ) => Promise<void>
}

export function useFarmerWorkspace({
  farmers,
  farms,
  search,
  created,
  onOpen,
  onReviewAction,
}: UseFarmerWorkspaceParams) {
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null)
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null)
  const [isFarmImageGalleryOpen, setIsFarmImageGalleryOpen] = useState(false)
  const [farmerReviewStatuses, setFarmerReviewStatuses] = useState<
    Record<string, Pick<EntityRecord, 'status' | 'tone'>>
  >({})

  const allFarmers = useMemo(
    () =>
      [...created, ...farmers].map((farmer) => {
        const reviewStatus = farmer.entityId ? farmerReviewStatuses[farmer.entityId] : undefined
        return reviewStatus ? { ...farmer, ...reviewStatus } : farmer
      }),
    [created, farmerReviewStatuses, farmers],
  )
  const filters = useFarmerFilters({ allFarmers, farms, search })
  const selectedFarmer = selectedFarmerId
    ? (allFarmers.find((farmer) => farmer.entityId === selectedFarmerId) ?? null)
    : null

  const updateFarmerReview = async (
    farmer: EntityRecord,
    action: 'approved' | 'requested-information',
  ) => {
    const farmerId = farmer.entityId
    if (!farmerId) return
    await onReviewAction(action, farmer)
    setFarmerReviewStatuses((current) => ({
      ...current,
      [farmerId]:
        action === 'approved'
          ? { status: 'Verified', tone: 'green' }
          : { status: 'Needs information', tone: 'orange' },
    }))
  }

  const openFarmer = (farmer: EntityRecord) => {
    if (!farmer.entityId) return onOpen(farmer)
    setSelectedFarmerId(farmer.entityId)
    setSelectedFarmId(getFirstFarmIdForFarmer(farmer.entityId, farms))
    setIsFarmImageGalleryOpen(false)
  }
  const clearSelectedFarmer = () => {
    setSelectedFarmerId(null)
    setSelectedFarmId(null)
    setIsFarmImageGalleryOpen(false)
  }
  const reviewSelectedFarmer = (action: 'approved' | 'requested-information') =>
    selectedFarmer ? updateFarmerReview(selectedFarmer, action) : Promise.resolve()

  return {
    ...filters,
    farmerSummaryCards: createFarmerSummaryCards(allFarmers, farms),
    isFarmImageGalleryOpen,
    selectedFarmId,
    selectedFarmer,
    selectedFarmerFarms: selectedFarmerId ? (filters.farmerFarmLookup[selectedFarmerId] ?? []) : [],
    clearSelectedFarmer,
    downloadFarmers: () => downloadFarmersCsv(filters.filteredFarmers, farms),
    onCloseImageGallery: () => setIsFarmImageGalleryOpen(false),
    onOpenImageGallery: () => setIsFarmImageGalleryOpen(true),
    approveFarmer: (farmer: EntityRecord) => updateFarmerReview(farmer, 'approved'),
    approveSelectedFarmer: () => reviewSelectedFarmer('approved'),
    onSelectFarm: setSelectedFarmId,
    requestSelectedFarmerInformation: () => reviewSelectedFarmer('requested-information'),
    openFarmer,
  }
}
