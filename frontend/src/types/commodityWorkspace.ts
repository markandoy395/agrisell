export type AdminCommodityBatch = {
  dateType: string
  expiresAt: string | null
  harvestedAt: string | null
  id: string
  lotCode: string | null
  quantityReceived: number
  quantityRemaining: number
  sellUntil: string | null
  storageInstructions: string | null
}

export type AdminCommodity = {
  availabilityStatus: string
  availableQuantity: number
  batches: AdminCommodityBatch[]
  categoryId: string
  categoryName: string
  commodityId: string
  createdAt: string
  description: string
  farmId: string
  farmLocation: string
  farmName: string
  farmerEmail: string
  farmerId: string
  farmerName: string
  gradeQuality: string | null
  harvestDate: string | null
  imageUrl: string
  isOrganic: boolean
  minimumOrderQuantity: number | null
  name: string
  price: number
  productionStatus: string
  status: string
  unitType: string
  updatedAt: string
}

export type FarmOption = {
  farmId: string
  farmName: string
  farmerId: string
  farmerName: string
  location?: string
}

export type CommodityCatalogResponse = {
  categories: string[]
  commodities: AdminCommodity[]
  farms?: FarmOption[]
}

export type CommoditySummary = {
  availableCount: number
  delistedCount: number
  growingCount: number
  harvestedCount: number
  hiddenCount: number
  outOfStockCount: number
  totalCount: number
}

export type CommodityFilterState = {
  category: string
  productionStatus: string
  search: string
  status: string
}

export type CommodityCreatePayload = {
  farmId: string
  name: string
  categoryName: string
  categoryId?: string
  description?: string
  price: number
  unitType: string
  availableQuantity: number
  minimumOrderQuantity?: number | null
  gradeQuality?: string | null
  productionStatus?: string
  availabilityStatus?: string
  isOrganic?: boolean
  status?: string
  harvestDate?: string | null
  imageUrl?: string | null
  // Initial batch details
  lotCode?: string | null
  dateType?: string
  harvestedAt?: string | null
  sellUntil?: string | null
  expiresAt?: string | null
  storageInstructions?: string | null
}

export type CommodityEditPayload = {
  name?: string
  categoryId?: string
  categoryName?: string
  description?: string
  price?: number
  unitType?: string
  availableQuantity?: number
  minimumOrderQuantity?: number | null
  gradeQuality?: string | null
  productionStatus?: string
  availabilityStatus?: string
  isOrganic?: boolean
  status?: string
  harvestDate?: string | null
  imageUrl?: string | null
  // Granular Agricultural Batch Details
  batchId?: string
  lotCode?: string | null
  dateType?: string
  harvestedAt?: string | null
  sellUntil?: string | null
  expiresAt?: string | null
  storageInstructions?: string | null
}

