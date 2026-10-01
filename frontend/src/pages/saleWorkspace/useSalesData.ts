import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestAdminApi } from '../../api/adminAuth'
import type { FarmOption, Product, Sale, SaleStatus, SaleSummary } from './saleWorkspace.types'
import { getSaleStatus, SALE_STATUSES } from './saleWorkspace.utils'

export function useSalesData(onNotice: (message: string) => void) {
  const noticeRef = useRef(onNotice)
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [farms, setFarms] = useState<FarmOption[]>([])
  const [busySaleId, setBusySaleId] = useState<string | null>(null)

  useEffect(() => {
    noticeRef.current = onNotice
  }, [onNotice])

  const load = useCallback(async () => {
    const data = (await requestAdminApi('/api/admin/sales')) as {
      farms?: FarmOption[]
      products: Product[]
      sales: Sale[]
    }
    setSales(data.sales)
    setProducts(data.products)
    if (data.farms) setFarms(data.farms)
  }, [])

  useEffect(() => {
    void requestAdminApi('/api/admin/sales')
      .then((response) => {
        const data = response as {
          farms?: FarmOption[]
          products: Product[]
          sales: Sale[]
        }
        setSales(data.sales)
        setProducts(data.products)
        if (data.farms) setFarms(data.farms)
      })
      .catch(() => noticeRef.current('Sales could not be loaded.'))
  }, [])

  const statusById = useMemo(
    () => new Map(sales.map((sale) => [sale.id, getSaleStatus(sale)])),
    [sales],
  )
  const enabledProductSales = useMemo(() => {
    const result = new Map<string, Sale[]>()
    sales.forEach((sale) => {
      const status = statusById.get(sale.id)
      if (status !== 'active' && status !== 'scheduled') return
      sale.products.forEach((product) => {
        result.set(product.id, [...(result.get(product.id) ?? []), sale])
      })
    })
    return result
  }, [sales, statusById])
  const summary = useMemo<SaleSummary>(() => {
    const active = sales.filter((sale) => statusById.get(sale.id) === 'active')
    const scheduled = sales.filter((sale) => statusById.get(sale.id) === 'scheduled')
    const current = [...active, ...scheduled]
    const platformSales = sales.filter((sale) => !sale.farmId).length
    const farmerSales = sales.filter((sale) => Boolean(sale.farmId)).length
    return {
      active: active.length,
      farmerSales,
      newUser: current.filter((sale) => sale.targetUserGroup === 'new_users_only').length,
      platformSales,
      products: new Set(active.flatMap((sale) => sale.products.map((product) => product.id))).size,
      scheduled: scheduled.length,
    }
  }, [sales, statusById])
  const promotionCounts = useMemo(
    () =>
      SALE_STATUSES.reduce<Record<SaleStatus, number>>(
        (counts, status) => {
          counts[status.key] = sales.filter((sale) => statusById.get(sale.id) === status.key).length
          return counts
        },
        { active: 0, disabled: 0, expired: 0, scheduled: 0 },
      ),
    [sales, statusById],
  )
  const productsOnSale = useMemo(
    () =>
      sales.flatMap((sale) => {
        const status = statusById.get(sale.id)
        if (status !== 'active' && status !== 'scheduled') return []
        return sale.products.flatMap((saleProduct) => {
          const product = products.find((item) => item.id === saleProduct.id)
          return product ? [{ product, sale, status }] : []
        })
      }),
    [products, sales, statusById],
  )

  const toggle = async (sale: Sale) => {
    if (sale.isEnabled && sale.farmId) {
      const confirmMsg = `⚠️ CAUTION: "${sale.name}" is a live farmer promotion for ${sale.farmName ?? 'the farm'}.\n\nDisabling this will pause the promotion in their store. Do you want to continue?`
      if (!window.confirm(confirmMsg)) return
    }
    setBusySaleId(sale.id)
    try {
      await requestAdminApi(`/api/admin/sales/${sale.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled: !sale.isEnabled }),
      })
      await load()
      onNotice(sale.isEnabled ? 'Promotion disabled.' : 'Promotion enabled.')
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Promotion status could not be changed.')
    } finally {
      setBusySaleId(null)
    }
  }

  const remove = async (sale: Sale, onRemoved: () => void) => {
    const isFarmer = Boolean(sale.farmId || sale.scope === 'farmer')
    const message = isFarmer
      ? `⚠️ WARNING: "${sale.name}" is a private farmer promotion created by ${sale.farmName ?? 'the farmer'}${sale.farmerName ? ` (${sale.farmerName})` : ''}.\n\nDeleting it will immediately remove the discount from the farmer's store and cannot be undone.\n\nAre you sure you want to permanently delete this farmer's promotion?`
      : `Remove platform promotion "${sale.name}"? This cannot be undone.`

    if (!window.confirm(message)) return
    setBusySaleId(sale.id)
    try {
      await requestAdminApi(`/api/admin/sales/${sale.id}`, { method: 'DELETE' })
      onRemoved()
      await load()
      onNotice(isFarmer ? 'Farmer promotion removed.' : 'Promotion removed.')
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Promotion could not be removed.')
    } finally {
      setBusySaleId(null)
    }
  }

  return {
    busySaleId,
    enabledProductSales,
    farms,
    load,
    products,
    productsOnSale,
    promotionCounts,
    remove,
    sales,
    statusById,
    summary,
    toggle,
  }
}
