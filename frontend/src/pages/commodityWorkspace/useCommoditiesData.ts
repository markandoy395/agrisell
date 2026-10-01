import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createCommodity,
  fetchCommodities,
  updateCommodityDetails,
  updateCommodityStatus,
} from '../../api/adminCommodityApi'
import { getApiErrorMessage } from '../../api/adminAuth'
import type {
  AdminCommodity,
  CommodityCreatePayload,
  CommodityEditPayload,
  CommodityFilterState,
  CommoditySummary,
  FarmOption,
} from '../../types/commodityWorkspace'
import {
  fetchCommoditiesCached,
  getCommodityCache,
  setCommodityCache,
  setDefaultCommodityFetcher,
} from './commodityCache'

setDefaultCommodityFetcher((sig) => fetchCommodities(sig))

const ITEMS_PER_PAGE = 10

export function useCommoditiesData(onNotice: (message: string) => void) {
  const initialCache = getCommodityCache()
  const [commodities, setCommodities] = useState<AdminCommodity[]>(
    () => initialCache?.commodities ?? [],
  )
  const [categories, setCategories] = useState<string[]>(
    () => initialCache?.categories ?? [],
  )
  const [farms, setFarms] = useState<FarmOption[]>(
    () => initialCache?.farms ?? [],
  )
  const [isLoading, setIsLoading] = useState(() => initialCache === null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyCommodityId, setBusyCommodityId] = useState<string | null>(null)
  const [editingCommodity, setEditingCommodity] = useState<AdminCommodity | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [filters, setFilters] = useState<CommodityFilterState>({
    category: 'all',
    productionStatus: 'all',
    search: '',
    status: 'all',
  })

  const noticeRef = useRef(onNotice)
  useEffect(() => {
    noticeRef.current = onNotice
  }, [onNotice])

  const load = useCallback(
    async (options?: { forceLoading?: boolean }) => {
      const hasCache = getCommodityCache() !== null
      if (!hasCache || options?.forceLoading) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      setError(null)
      try {
        const data = await fetchCommoditiesCached(undefined, undefined, true)
        setCommodities(data.commodities)
        setCategories(data.categories)
        setFarms(data.farms || [])
        setCommodityCache(data)
      } catch (err) {
        const msg = getApiErrorMessage(err, 'Failed to load commodities catalog.')
        setError(msg)
        noticeRef.current?.(msg)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo<CommoditySummary>(() => {
    let availableCount = 0
    let hiddenCount = 0
    let delistedCount = 0
    let outOfStockCount = 0
    let growingCount = 0
    let harvestedCount = 0

    commodities.forEach((c) => {
      const st = c.status.toLowerCase()
      if (st === 'available') availableCount++
      if (st === 'hidden') hiddenCount++
      if (st === 'delisted') delistedCount++
      if (st === 'out_of_stock' || c.availableQuantity <= 0) outOfStockCount++

      const prod = c.productionStatus.toLowerCase()
      if (prod === 'growing') growingCount++
      if (prod === 'harvested') harvestedCount++
    })

    return {
      availableCount,
      delistedCount,
      growingCount,
      harvestedCount,
      hiddenCount,
      outOfStockCount,
      totalCount: commodities.length,
    }
  }, [commodities])

  const filteredCommodities = useMemo(() => {
    const query = filters.search.toLowerCase().trim()
    return commodities.filter((c) => {
      if (filters.status !== 'all') {
        const st = c.status.toLowerCase()
        if (filters.status === 'out_of_stock') {
          if (st !== 'out_of_stock' && c.availableQuantity > 0) return false
        } else if (st !== filters.status.toLowerCase()) {
          return false
        }
      }

      if (filters.productionStatus !== 'all') {
        if (c.productionStatus.toLowerCase() !== filters.productionStatus.toLowerCase()) {
          return false
        }
      }

      if (filters.category !== 'all') {
        if (c.categoryName.toLowerCase() !== filters.category.toLowerCase()) {
          return false
        }
      }

      if (query) {
        const matchesName = c.name.toLowerCase().includes(query)
        const matchesFarm = c.farmName.toLowerCase().includes(query)
        const matchesFarmer = c.farmerName.toLowerCase().includes(query)
        const matchesCat = c.categoryName.toLowerCase().includes(query)
        const matchesId = c.commodityId.toLowerCase().includes(query)
        const matchesLot = c.batches.some(
          (b) => b.lotCode && b.lotCode.toLowerCase().includes(query),
        )
        if (
          !matchesName &&
          !matchesFarm &&
          !matchesFarmer &&
          !matchesCat &&
          !matchesId &&
          !matchesLot
        ) {
          return false
        }
      }

      return true
    })
  }, [commodities, filters])

  const totalPages = Math.max(1, Math.ceil(filteredCommodities.length / ITEMS_PER_PAGE))
  const paginatedCommodities = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredCommodities.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredCommodities, currentPage])

  const setStatusFilter = (status: string) => {
    setFilters((prev) => ({ ...prev, status }))
    setCurrentPage(1)
  }

  const setProductionStatusFilter = (productionStatus: string) => {
    setFilters((prev) => ({ ...prev, productionStatus }))
    setCurrentPage(1)
  }

  const setCategoryFilter = (category: string) => {
    setFilters((prev) => ({ ...prev, category }))
    setCurrentPage(1)
  }

  const setSearchQuery = (search: string) => {
    setFilters((prev) => ({ ...prev, search }))
    setCurrentPage(1)
  }

  const handleStatusChange = async (
    commodity: AdminCommodity,
    newStatus: 'available' | 'hidden' | 'delisted' | 'approved',
  ) => {
    const targetStatus = newStatus === 'approved' ? 'available' : newStatus
    setBusyCommodityId(commodity.commodityId)
    const prevList = commodities

    // Optimistic update
    const nextList = commodities.map((item) =>
      item.commodityId === commodity.commodityId ? { ...item, status: targetStatus } : item,
    )
    setCommodities(nextList)
    setCommodityCache({
      commodities: nextList,
      categories,
      farms,
    })

    try {
      await updateCommodityStatus(commodity.commodityId, newStatus)
      const label =
        targetStatus === 'available'
          ? 'approved and listed on the marketplace'
          : targetStatus === 'hidden'
            ? 'hidden from marketplace buyers'
            : 'delisted from the marketplace catalog'
      onNotice(`"${commodity.name}" is now ${label}.`)
    } catch (err) {
      setCommodities(prevList)
      onNotice(getApiErrorMessage(err, 'Failed to update commodity status. Please try again.'))
    } finally {
      setBusyCommodityId(null)
    }
  }

  const availableFarms = useMemo<FarmOption[]>(() => {
    if (farms.length > 0) return farms
    // Fallback: derive farms from existing commodities list
    const farmMap = new Map<string, FarmOption>()
    commodities.forEach((c) => {
      if (c.farmId && !farmMap.has(c.farmId)) {
        farmMap.set(c.farmId, {
          farmId: c.farmId,
          farmName: c.farmName,
          farmerId: c.farmerId,
          farmerName: c.farmerName,
          location: c.farmLocation,
        })
      }
    })
    return Array.from(farmMap.values())
  }, [farms, commodities])

  const handleCreateCommodity = async (payload: CommodityCreatePayload) => {
    try {
      const result = await createCommodity(payload)
      onNotice(`Product "${payload.name}" created successfully.`)
      await load()
      return result
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to create product. Please try again.')
      onNotice(msg)
      throw err
    }
  }

  const handleSaveEdit = async (commodityId: string, updates: CommodityEditPayload) => {
    setBusyCommodityId(commodityId)
    try {
      await updateCommodityDetails(commodityId, updates)
      setCommodities((prev) =>
        prev.map((item) => {
          if (item.commodityId !== commodityId) return item
          const updatedBatches = [...item.batches]
          if (
            updates.lotCode !== undefined ||
            updates.dateType !== undefined ||
            updates.harvestedAt !== undefined ||
            updates.sellUntil !== undefined ||
            updates.expiresAt !== undefined ||
            updates.storageInstructions !== undefined
          ) {
            if (updatedBatches.length > 0) {
              const bIndex = updates.batchId
                ? updatedBatches.findIndex((b) => b.id === updates.batchId)
                : 0
              const targetIdx = bIndex >= 0 ? bIndex : 0
              const existingB = updatedBatches[targetIdx]
              updatedBatches[targetIdx] = {
                ...existingB,
                lotCode: updates.lotCode !== undefined ? updates.lotCode : existingB.lotCode,
                dateType: updates.dateType !== undefined ? updates.dateType : existingB.dateType,
                harvestedAt: updates.harvestedAt !== undefined ? updates.harvestedAt : existingB.harvestedAt,
                sellUntil: updates.sellUntil !== undefined ? updates.sellUntil : existingB.sellUntil,
                expiresAt: updates.expiresAt !== undefined ? updates.expiresAt : existingB.expiresAt,
                storageInstructions: updates.storageInstructions !== undefined ? updates.storageInstructions : existingB.storageInstructions,
                quantityRemaining: updates.availableQuantity !== undefined ? updates.availableQuantity : existingB.quantityRemaining,
              }
            } else {
              updatedBatches.push({
                dateType: updates.dateType || 'fresh_produce',
                expiresAt: updates.expiresAt || null,
                harvestedAt: updates.harvestedAt || updates.harvestDate || null,
                id: 'new-lot',
                lotCode: updates.lotCode || null,
                quantityReceived: updates.availableQuantity ?? item.availableQuantity,
                quantityRemaining: updates.availableQuantity ?? item.availableQuantity,
                sellUntil: updates.sellUntil || null,
                storageInstructions: updates.storageInstructions || null,
              })
            }
          }
          return {
            ...item,
            availabilityStatus: updates.availabilityStatus ?? item.availabilityStatus,
            availableQuantity: updates.availableQuantity ?? item.availableQuantity,
            batches: updatedBatches,
            categoryName: updates.categoryName ?? item.categoryName,
            description: updates.description ?? item.description,
            gradeQuality: updates.gradeQuality !== undefined ? updates.gradeQuality : item.gradeQuality,
            harvestDate: updates.harvestDate !== undefined ? updates.harvestDate : item.harvestDate,
            isOrganic: updates.isOrganic ?? item.isOrganic,
            minimumOrderQuantity: updates.minimumOrderQuantity !== undefined ? updates.minimumOrderQuantity : item.minimumOrderQuantity,
            name: updates.name ?? item.name,
            price: updates.price ?? item.price,
            productionStatus: updates.productionStatus ?? item.productionStatus,
            status: updates.status ?? item.status,
            unitType: updates.unitType ?? item.unitType,
          }
        }),
      )
      onNotice('Product details updated successfully.')
      setEditingCommodity(null)
    } catch (err) {
      onNotice(getApiErrorMessage(err, 'Failed to update product details. Please try again.'))
      throw err
    } finally {
      setBusyCommodityId(null)
    }
  }

  return {
    busyCommodityId,
    categories,
    commodities: paginatedCommodities,
    currentPage,
    editingCommodity,
    error,
    farms: availableFarms,
    filteredCount: filteredCommodities.length,
    filters,
    handleCreateCommodity,
    handleSaveEdit,
    handleStatusChange,
    isLoading,
    isRefreshing,
    load,
    openEdit: (c: AdminCommodity) => setEditingCommodity(c),
    closeEdit: () => setEditingCommodity(null),
    setCurrentPage,
    setCategoryFilter,
    setProductionStatusFilter,
    setSearchQuery,
    setStatusFilter,
    summary,
    totalPages,
  }
}

