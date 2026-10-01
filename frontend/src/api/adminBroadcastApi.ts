import { requestAdminApi } from './adminAuth'
import type {
  AudienceCounts,
  BroadcastHistoryResponse,
  BroadcastPayload,
  BroadcastSendResponse,
} from '../types/broadcast'

export const sendBroadcast = async (
  payload: BroadcastPayload,
): Promise<BroadcastSendResponse> => {
  return (await requestAdminApi('/api/admin/broadcasts', {
    body: JSON.stringify(payload),
    method: 'POST',
  })) as BroadcastSendResponse
}

export const fetchBroadcastHistory = async (options?: {
  limit?: number
  offset?: number
  signal?: AbortSignal
}): Promise<BroadcastHistoryResponse> => {
  const query = new URLSearchParams()
  if (options?.limit) query.set('limit', String(options.limit))
  if (options?.offset) query.set('offset', String(options.offset))
  const queryString = query.toString() ? `?${query.toString()}` : ''

  const result = (await requestAdminApi(`/api/admin/broadcasts${queryString}`, {
    signal: options?.signal,
  })) as BroadcastHistoryResponse

  return {
    broadcasts: Array.isArray(result?.broadcasts) ? result.broadcasts : [],
    totalCount: Number(result?.totalCount) || 0,
  }
}

export const fetchAudienceCounts = async (
  signal?: AbortSignal,
): Promise<AudienceCounts> => {
  const result = (await requestAdminApi('/api/admin/broadcasts/audience-counts', {
    signal,
  })) as { counts?: AudienceCounts }

  return (
    result?.counts || {
      all: 0,
      buyers: 0,
      farmers: 0,
      riders: 0,
    }
  )
}
