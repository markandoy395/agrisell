export type CategoryStatus = 'active' | 'delisted'

export type CategoryItem = {
  categoryId: string
  id: string
  categoryName: string
  description: string
  status: CategoryStatus
  farmId: string
  farmName: string
  commodityCount: number
  displayOrder: number
  createdAt: string
}

export type CategorySummary = {
  totalCount: number
  activeCount: number
  delistedCount: number
  taggedCommodityCount: number
}

export type CategoryCatalogResponse = {
  categories: CategoryItem[]
  totalCount?: number
  activeCount?: number
  delistedCount?: number
}

export type CategoryCreateInput = {
  categoryName: string
  description?: string
  farmId?: string
  status?: CategoryStatus
  displayOrder?: number
}

export type CategoryUpdateInput = {
  categoryName?: string
  description?: string
  farmId?: string
  status?: CategoryStatus
  displayOrder?: number
}
