import { requestAdminApi } from './adminAuth'
import type { SafetyIncidentsResponse } from '../pages/safetyWorkspace/safetyWorkspace.types'

export const getSafetyIncidents = async (query?: {
  status?: string
  search?: string
  offset?: number
  limit?: number
}): Promise<SafetyIncidentsResponse> => {
  const params = new URLSearchParams()
  if (query?.status) params.set('status', query.status)
  if (query?.search) params.set('search', query.search)
  if (query?.offset !== undefined) params.set('offset', String(query.offset))
  if (query?.limit !== undefined) params.set('limit', String(query.limit))

  const queryString = params.toString()
  const endpoint = `/api/admin/safety${queryString ? `?${queryString}` : ''}`
  const response = (await requestAdminApi(endpoint)) as SafetyIncidentsResponse

  return {
    incidents: Array.isArray(response.incidents) ? response.incidents : [],
    summary: response.summary ?? {
      total_incidents: 0,
      open_emergencies: 0,
      active_accidents: 0,
      under_review: 0,
      resolved: 0,
    },
  }
}

export const resolveSafetyIncident = async (
  reportId: string,
  status: string,
  notes: string,
) => {
  return requestAdminApi('/api/admin/safety/resolve', {
    method: 'POST',
    body: JSON.stringify({ reportId, status, notes }),
  })
}
