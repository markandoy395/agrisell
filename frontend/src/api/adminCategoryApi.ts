import { requestAdminApi } from './adminAuth'
import type {
  CategoryCatalogResponse,
  CategoryCreateInput,
  CategoryItem,
  CategoryStatus,
  CategoryUpdateInput,
} from '../types/categoryWorkspace'

export const fetchCategories = async (signal?: AbortSignal): Promise<CategoryCatalogResponse> => {
  const result = (await requestAdminApi('/api/admin/categories', {
    signal,
  })) as CategoryCatalogResponse

  return {
    categories: Array.isArray(result?.categories) ? result.categories : [],
    totalCount: result?.totalCount,
    activeCount: result?.activeCount,
    delistedCount: result?.delistedCount,
  }
}

export const createCategory = async (
  payload: CategoryCreateInput,
): Promise<{ category: CategoryItem }> => {
  return (await requestAdminApi('/api/admin/categories', {
    body: JSON.stringify(payload),
    method: 'POST',
  })) as { category: CategoryItem }
}

export const updateCategory = async (
  categoryId: string,
  payload: CategoryUpdateInput,
): Promise<{ category: CategoryItem }> => {
  return (await requestAdminApi(`/api/admin/categories/${encodeURIComponent(categoryId)}`, {
    body: JSON.stringify(payload),
    method: 'PATCH',
  })) as { category: CategoryItem }
}

export const updateCategoryStatus = async (
  categoryId: string,
  status: CategoryStatus,
): Promise<{ category: CategoryItem }> => {
  return (await requestAdminApi(`/api/admin/categories/${encodeURIComponent(categoryId)}/status`, {
    body: JSON.stringify({ status }),
    method: 'PATCH',
  })) as { category: CategoryItem }
}

export const reorderCategories = async (
  orderedIds: string[],
): Promise<{ orderedIds: string[]; updated: boolean }> => {
  return (await requestAdminApi('/api/admin/categories/reorder', {
    body: JSON.stringify({ orderedIds }),
    method: 'PUT',
  })) as { orderedIds: string[]; updated: boolean }
}
