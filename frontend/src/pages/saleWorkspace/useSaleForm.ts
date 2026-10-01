import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { requestAdminApi } from '../../api/adminAuth'
import type { DiscountType, FarmOption, Product, Sale, TargetGroup } from './saleWorkspace.types'
import {
  getSalePrice,
  getStockTone,
  localDateTimeToUtc,
  timeRangesOverlap,
  utcToLocalDateTime,
} from './saleWorkspace.utils'

type SaleFormOptions = {
  enabledProductSales: Map<string, Sale[]>
  farms: FarmOption[]
  load: () => Promise<void>
  onNotice: (message: string) => void
  products: Product[]
}

export function useSaleForm({
  enabledProductSales,
  farms,
  load,
  onNotice,
  products,
}: SaleFormOptions) {
  const [selected, setSelected] = useState<string[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [farmFilter, setFarmFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [saleProductFilter, setSaleProductFilter] = useState('all')
  const [name, setName] = useState('')
  const [type, setType] = useState<DiscountType>('percentage')
  const [value, setValue] = useState('')
  const [target, setTarget] = useState<TargetGroup>('all_users')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [promoteOnHome, setPromoteOnHome] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [scope, setScope] = useState<'platform' | 'farmer'>('platform')
  const [selectedFarmId, setSelectedFarmId] = useState<string>('')
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [editingFarmId, setEditingFarmId] = useState<string | null>(null)
  const [editingFarmName, setEditingFarmName] = useState<string | null>(null)
  const [editingFarmerName, setEditingFarmerName] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const resetForm = useCallback(() => {
    setName('')
    setType('percentage')
    setValue('')
    setTarget('all_users')
    setSelected([])
    setStartsAt('')
    setEndsAt('')
    setPromoteOnHome(false)
    setPromoCode('')
    setScope('platform')
    setSelectedFarmId('')
    setFarmFilter('all')
    setEditingSaleId(null)
    setEditingFarmId(null)
    setEditingFarmName(null)
    setEditingFarmerName(null)
  }, [])

  const closeForm = useCallback(() => {
    if (isSaving) return
    resetForm()
    setIsFormOpen(false)
  }, [isSaving, resetForm])

  useEffect(() => {
    if (!isFormOpen) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) closeForm()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeForm, isFormOpen, isSaving])

  if (selected.length < 2 && promoteOnHome) setPromoteOnHome(false)

  const categories = useMemo(
    () =>
      [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) =>
        a!.localeCompare(b!),
      ) as string[],
    [products],
  )

  const activeFarmScopeId = editingSaleId ? editingFarmId : scope === 'farmer' ? selectedFarmId : null

  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase()
    return products.filter((product) => {
      // If scoped to a specific farm, strictly filter out products from any other farm
      if (activeFarmScopeId && product.farmId !== activeFarmScopeId) {
        return false
      }
      // Farm filter dropdown for platform promotions
      if (!activeFarmScopeId && farmFilter !== 'all' && product.farmId !== farmFilter) {
        return false
      }
      const matchesQuery =
        !query ||
        `${product.name} ${product.unit} ${product.category ?? ''} ${product.farmName ?? ''}`
          .toLocaleLowerCase()
          .includes(query)
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter
      const stockTone = getStockTone(product)
      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'available' ? stockTone !== 'out' : stockTone === stockFilter)
      const hasPromotion = (enabledProductSales.get(product.id) ?? []).some(
        (sale) => sale.id !== editingSaleId && timeRangesOverlap(startsAt, endsAt, sale),
      )
      const matchesSale =
        saleProductFilter === 'all' ||
        (saleProductFilter === 'on_sale' ? hasPromotion : !hasPromotion)
      return matchesQuery && matchesCategory && matchesStock && matchesSale
    })
  }, [
    activeFarmScopeId,
    categoryFilter,
    editingSaleId,
    enabledProductSales,
    endsAt,
    farmFilter,
    productQuery,
    products,
    saleProductFilter,
    startsAt,
    stockFilter,
  ])

  const discountValue = Number(value)
  const selectedProducts = products.filter((product) => selected.includes(product.id))
  const invalidPreviewCount = selectedProducts.filter((product) => {
    const price = getSalePrice(product.price, type, discountValue)
    return price <= 0 || price >= product.price
  }).length
  const isDiscountValid =
    Number.isFinite(discountValue) && discountValue > 0 && invalidPreviewCount === 0
  const isDateRangeValid = !startsAt || !endsAt || new Date(endsAt) > new Date(startsAt)

  const selectVisible = () =>
    setSelected((items) => [
      ...new Set([
        ...items,
        ...visibleProducts
          .filter(
            (product) =>
              getStockTone(product) !== 'out' &&
              !(enabledProductSales.get(product.id) ?? []).some(
                (sale) => sale.id !== editingSaleId && timeRangesOverlap(startsAt, endsAt, sale),
              ),
          )
          .map((product) => product.id),
      ]),
    ])

  const clearVisible = () =>
    setSelected((items) =>
      items.filter((id) => !visibleProducts.some((product) => product.id === id)),
    )

  const openCreate = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const edit = (sale: Sale) => {
    setEditingSaleId(sale.id)
    setName(sale.name)
    setType(sale.discountType)
    setValue(String(sale.discountValue))
    setTarget(sale.targetUserGroup)
    setSelected(sale.products.map((product) => product.id))
    setStartsAt(utcToLocalDateTime(sale.startsAt))
    setEndsAt(utcToLocalDateTime(sale.endsAt))
    setPromoteOnHome(sale.promoteOnHome)
    setPromoCode(sale.promoCode ?? '')
    setScope(sale.farmId ? 'farmer' : 'platform')
    setSelectedFarmId(sale.farmId ?? '')
    setEditingFarmId(sale.farmId ?? null)
    setEditingFarmName(sale.farmName ?? null)
    setEditingFarmerName(sale.farmerName ?? null)
    setIsFormOpen(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isDiscountValid) {
      onNotice('Enter a discount that lowers every selected product price.')
      return
    }
    if (scope === 'farmer' && !activeFarmScopeId) {
      onNotice('Please select the farm this promotion belongs to.')
      return
    }
    setIsSaving(true)
    try {
      await requestAdminApi(
        editingSaleId ? `/api/admin/sales/${editingSaleId}` : '/api/admin/sales',
        {
          method: editingSaleId ? 'PATCH' : 'POST',
          body: JSON.stringify({
            commodityIds: selected.map(Number),
            discountType: type,
            discountValue,
            endsAt: localDateTimeToUtc(endsAt),
            farmId: activeFarmScopeId || null,
            name,
            promoCode: promoCode.trim().toUpperCase() || null,
            promoteOnHome,
            startsAt: localDateTimeToUtc(startsAt),
            targetUserGroup: target,
          }),
        },
      )
      const wasEditing = Boolean(editingSaleId)
      resetForm()
      setIsFormOpen(false)
      await load()
      onNotice(wasEditing ? 'Promotion updated.' : 'Promotion created.')
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'The promotion could not be saved.')
    } finally {
      setIsSaving(false)
    }
  }

  return {
    activeFarmScopeId,
    categories,
    categoryFilter,
    clearVisible,
    closeForm,
    discountValue,
    edit,
    editingFarmId,
    editingFarmName,
    editingFarmerName,
    editingSaleId,
    enabledProductSales,
    endsAt,
    farmFilter,
    farms,
    invalidPreviewCount,
    isDateRangeValid,
    isDiscountValid,
    isFormOpen,
    isSaving,
    name,
    openCreate,
    productQuery,
    products,
    promoCode,
    promoteOnHome,
    resetForm,
    saleProductFilter,
    scope,
    selected,
    selectedFarmId,
    selectedProducts,
    selectVisible,
    setCategoryFilter,
    setEndsAt,
    setFarmFilter,
    setName,
    setProductQuery,
    setPromoCode,
    setPromoteOnHome,
    setSaleProductFilter,
    setScope,
    setSelected,
    setSelectedFarmId,
    setStartsAt,
    setStockFilter,
    setTarget,
    setType,
    setValue,
    startsAt,
    stockFilter,
    submit,
    target,
    type,
    value,
    visibleProducts,
  }
}

export type SaleFormState = ReturnType<typeof useSaleForm>
