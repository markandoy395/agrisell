import { requestAdminApi } from './adminAuth'
import type {
  Delivery,
  DeliveryDetail,
  DeliveryOptions,
  FarmerRiderRequestsResponse,
  TrackedRider,
} from '../types/delivery'

export async function fetchTrackedRiders(signal?: AbortSignal): Promise<TrackedRider[]> {
  const rows: TrackedRider[] = []
  let total: number
  do {
    const page = (await requestAdminApi(`/api/admin/deliveries/riders?offset=${rows.length}`, {
      signal,
    })) as { rows: TrackedRider[]; total: number }
    if (!Array.isArray(page.rows) || !Number.isFinite(page.total))
      throw new Error('Invalid rider location response.')
    rows.push(...page.rows)
    total = page.total
    if (!page.rows.length) break
  } while (rows.length < total)
  return rows
}

export async function fetchDeliveries(active = false, signal?: AbortSignal): Promise<Delivery[]> {
  const rows: Delivery[] = []
  let total: number
  do {
    const page = (await requestAdminApi(
      `/api/admin/deliveries${active ? '/tracking' : ''}?offset=${rows.length}`,
      { signal },
    )) as { rows: Delivery[]; total: number }
    if (!Array.isArray(page.rows) || !Number.isFinite(page.total))
      throw new Error('Invalid delivery response.')
    rows.push(...page.rows)
    total = page.total
    if (!page.rows.length) break
  } while (rows.length < total)
  return rows
}
export const fetchDeliveryOptions = async (signal?: AbortSignal) =>
  (await requestAdminApi('/api/admin/deliveries/options', { signal })) as DeliveryOptions
export const fetchFarmerRiderRequests = async (
  params?: {
    delivery_id?: number
    status?: string
    offset?: number
    limit?: number
  },
  signal?: AbortSignal,
): Promise<FarmerRiderRequestsResponse> => {
  const query = new URLSearchParams()
  if (params?.delivery_id) query.set('delivery_id', String(params.delivery_id))
  if (params?.status && params.status !== 'all') query.set('status', params.status)
  if (params?.offset !== undefined) query.set('offset', String(params.offset))
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  return (await requestAdminApi(
    `/api/admin/deliveries/farmer-requests${qs ? `?${qs}` : ''}`,
    { signal },
  )) as FarmerRiderRequestsResponse
}
export const fetchDeliveryDetail = async (id: number, signal?: AbortSignal) =>
  (await requestAdminApi(`/api/admin/deliveries/${id}`, { signal })) as DeliveryDetail
export const saveDelivery = async (body: Record<string, unknown>) =>
  await requestAdminApi('/api/admin/deliveries', { method: 'POST', body: JSON.stringify(body) })
export const proofImageUrl = (path: string) => {
  if (/^https:\/\/[^/]+\/storage\/v1\/object\/sign\/delivery-proofs\//.test(path)) return path
  return ''
}
