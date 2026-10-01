import type { CategoryCatalogResponse } from '../../types/categoryWorkspace'
import { createWorkspaceCache, type CacheFetcher } from '../../utils/workspaceCache.ts'

export type CategoryCacheData = CategoryCatalogResponse

export const categoryCache = createWorkspaceCache<CategoryCacheData>(async (signal) => {
  const { fetchCategories } = await import('../../api/adminCategoryApi')
  return fetchCategories(signal)
})

export const setDefaultCategoryFetcher = (fetcher: CacheFetcher<CategoryCacheData>) => {
  categoryCache.setDefaultFetcher(fetcher)
}

export const getCategoryCache = () => categoryCache.get()

export const setCategoryCache = (data: CategoryCacheData) => {
  categoryCache.set(data)
}

export const clearCategoryCache = () => {
  categoryCache.clear()
}

export const fetchCategoriesCached = (
  signal?: AbortSignal,
  fetcher?: CacheFetcher<CategoryCacheData>,
  forceRefresh?: boolean,
) => categoryCache.fetchCached(signal, fetcher, forceRefresh)

export const preloadCategories = (fetcher?: CacheFetcher<CategoryCacheData>) => {
  categoryCache.preload(fetcher)
}
