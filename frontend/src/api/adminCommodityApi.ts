import { requestAdminApi } from './adminAuth'
import type {
  AdminCommodity,
  CommodityCatalogResponse,
  CommodityCreatePayload,
  CommodityEditPayload,
} from '../types/commodityWorkspace'

export const fetchCommodities = async (signal?: AbortSignal): Promise<CommodityCatalogResponse> => {
  const result = (await requestAdminApi('/api/admin/commodities', {
    signal,
  })) as CommodityCatalogResponse
  return {
    categories: Array.isArray(result?.categories) ? result.categories : [],
    commodities: Array.isArray(result?.commodities) ? result.commodities : [],
    farms: Array.isArray(result?.farms) ? result.farms : [],
  }
}

export const createCommodity = async (
  payload: CommodityCreatePayload,
): Promise<{ commodityId: string; created: boolean; commodity: AdminCommodity }> => {
  return (await requestAdminApi('/api/admin/commodities', {
    body: JSON.stringify(payload),
    method: 'POST',
  })) as { commodityId: string; created: boolean; commodity: AdminCommodity }
}

export const updateCommodityStatus = async (
  commodityId: string,
  status: 'available' | 'hidden' | 'delisted' | 'approved',
): Promise<{ commodityId: string; status: string; updated: boolean }> => {
  return (await requestAdminApi(
    `/api/admin/commodities/${encodeURIComponent(commodityId)}/status`,
    {
      body: JSON.stringify({ status }),
      method: 'PATCH',
    },
  )) as { commodityId: string; status: string; updated: boolean }
}

export const updateCommodityDetails = async (
  commodityId: string,
  payload: CommodityEditPayload,
): Promise<{ commodityId: string; updated: boolean; updates: Record<string, unknown> }> => {
  return (await requestAdminApi(`/api/admin/commodities/${encodeURIComponent(commodityId)}`, {
    body: JSON.stringify(payload),
    method: 'PATCH',
  })) as { commodityId: string; updated: boolean; updates: Record<string, unknown> }
}

