import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createCategory,
  fetchCategories,
  reorderCategories,
  updateCategory,
  updateCategoryStatus,
} from '../../api/adminData'
import type {
  CategoryCreateInput,
  CategoryItem,
  CategoryStatus,
  CategorySummary,
  CategoryUpdateInput,
} from '../../types/categoryWorkspace'
import {
  fetchCategoriesCached,
  getCategoryCache,
  setCategoryCache,
  setDefaultCategoryFetcher,
} from './categoryCache'

setDefaultCategoryFetcher((sig) => fetchCategories(sig))

export type EditingCategoryState = {
  isNew: boolean
  category?: CategoryItem
} | null

export function useCategoriesData(onNotice: (message: string) => void) {
  const initialCache = getCategoryCache()
  const [categories, setCategories] = useState<CategoryItem[]>(
    () => initialCache?.categories ?? [],
  )
  const [isLoading, setIsLoading] = useState(() => initialCache === null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delisted'>('all')
  const [isReorderMode, setIsReorderMode] = useState(false)
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<EditingCategoryState>(null)

  const load = useCallback(async (options?: { forceLoading?: boolean }) => {
    const hasCache = getCategoryCache() !== null
    if (!hasCache || options?.forceLoading) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)
    try {
      const response = await fetchCategoriesCached(undefined, undefined, true)
      setCategories(response.categories)
      setCategoryCache(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load produce categories.'
      setError(message)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary: CategorySummary = useMemo(() => {
    const totalCount = categories.length
    const activeCount = categories.filter((c) => c.status === 'active').length
    const delistedCount = categories.filter((c) => c.status === 'delisted').length
    const taggedCommodityCount = categories.reduce((sum, c) => sum + (c.commodityCount || 0), 0)
    return {
      activeCount,
      delistedCount,
      taggedCommodityCount,
      totalCount,
    }
  }, [categories])

  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return categories.filter((category) => {
      const matchesSearch =
        !q ||
        category.categoryName.toLowerCase().includes(q) ||
        category.description.toLowerCase().includes(q) ||
        category.farmName.toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === 'all' || category.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [categories, searchQuery, statusFilter])

  const handleCreate = async (input: CategoryCreateInput) => {
    setBusyCategoryId('new')
    try {
      await createCategory(input)
      await load()
      setEditingCategory(null)
      onNotice(`Category "${input.categoryName}" created successfully.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create category.'
      onNotice(message)
      throw err
    } finally {
      setBusyCategoryId(null)
    }
  }

  const handleUpdate = async (id: string, input: CategoryUpdateInput) => {
    setBusyCategoryId(id)
    try {
      await updateCategory(id, input)
      await load()
      setEditingCategory(null)
      onNotice('Category updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update category.'
      onNotice(message)
      throw err
    } finally {
      setBusyCategoryId(null)
    }
  }

  const handleToggleStatus = async (category: CategoryItem) => {
    const nextStatus: CategoryStatus = category.status === 'active' ? 'delisted' : 'active'
    setBusyCategoryId(category.id)
    try {
      await updateCategoryStatus(category.id, nextStatus)
      const nextCategories = categories.map((c) =>
        c.id === category.id ? { ...c, status: nextStatus } : c,
      )
      setCategories(nextCategories)
      setCategoryCache({ categories: nextCategories })
      onNotice(
        nextStatus === 'delisted'
          ? `Category "${category.categoryName}" delisted.`
          : `Category "${category.categoryName}" activated.`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not change category status.'
      onNotice(message)
    } finally {
      setBusyCategoryId(null)
    }
  }

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= categories.length) return

    const reordered = [...categories]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    // Update display orders locally
    const updatedWithOrder = reordered.map((cat, idx) => ({
      ...cat,
      displayOrder: idx + 1,
    }))
    setCategories(updatedWithOrder)
    setCategoryCache({ categories: updatedWithOrder })

    try {
      await reorderCategories(updatedWithOrder.map((c) => c.id))
      onNotice('Category display order updated.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save category order.'
      onNotice(message)
      void load()
    }
  }

  return {
    busyCategoryId,
    categories: filteredCategories,
    closeEdit: () => setEditingCategory(null),
    editingCategory,
    error,
    handleCreate,
    handleMoveOrder,
    handleToggleStatus,
    handleUpdate,
    isLoading,
    isRefreshing,
    isReorderMode,
    load,
    openCreate: () => setEditingCategory({ isNew: true }),
    openEdit: (category: CategoryItem) => setEditingCategory({ category, isNew: false }),
    searchQuery,
    setIsReorderMode,
    setSearchQuery,
    setStatusFilter,
    statusFilter,
    summary,
    totalRawCount: categories.length,
  }
}
