import type { SafetyIncidentsResponse } from './safetyWorkspace.types'
import { createWorkspaceCache, type CacheFetcher } from '../../utils/workspaceCache.ts'

export type SafetyCacheData = SafetyIncidentsResponse

export const safetyCache = createWorkspaceCache<SafetyCacheData>(async () => {
  const { getSafetyIncidents } = await import('../../api/adminSafetyApi')
  return getSafetyIncidents()
})

export const setDefaultSafetyFetcher = (fetcher: CacheFetcher<SafetyCacheData>) => {
  safetyCache.setDefaultFetcher(fetcher)
}

export const getSafetyCache = () => safetyCache.get()

export const setSafetyCache = (data: SafetyCacheData) => {
  safetyCache.set(data)
}

export const clearSafetyCache = () => {
  safetyCache.clear()
}

export const fetchSafetyCached = (
  signal?: AbortSignal,
  fetcher?: CacheFetcher<SafetyCacheData>,
  forceRefresh?: boolean,
) => safetyCache.fetchCached(signal, fetcher, forceRefresh)

export const preloadSafetyIncidents = (fetcher?: CacheFetcher<SafetyCacheData>) => {
  safetyCache.preload(fetcher)
}
