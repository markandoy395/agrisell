import type { CommodityCatalogResponse } from '../../types/commodityWorkspace'
import { createWorkspaceCache, type CacheFetcher } from '../../utils/workspaceCache.ts'

export type CommodityCacheData = CommodityCatalogResponse

export const commodityCache = createWorkspaceCache<CommodityCacheData>(async (signal) => {
  const { fetchCommodities } = await import('../../api/adminCommodityApi')
  return fetchCommodities(signal)
})

export const setDefaultCommodityFetcher = (fetcher: CacheFetcher<CommodityCacheData>) => {
  commodityCache.setDefaultFetcher(fetcher)
}

export const getCommodityCache = () => commodityCache.get()

export const setCommodityCache = (data: CommodityCacheData) => {
  commodityCache.set(data)
}

export const clearCommodityCache = () => {
  commodityCache.clear()
}

export const fetchCommoditiesCached = (
  signal?: AbortSignal,
  fetcher?: CacheFetcher<CommodityCacheData>,
  forceRefresh?: boolean,
) => commodityCache.fetchCached(signal, fetcher, forceRefresh)

export const preloadCommodities = (fetcher?: CacheFetcher<CommodityCacheData>) => {
  commodityCache.preload(fetcher)
}
