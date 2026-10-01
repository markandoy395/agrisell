import { useState } from 'react'
import { SaleCreateDialog } from './SaleCreateDialog'
import { SaleEditDialog } from './SaleEditDialog'
import { SaleHeaderSummary } from './SaleHeaderSummary'
import { SaleManagement } from './SaleManagement'
import { SaleProductOverview } from './SaleProductOverview'
import type { SaleStatus } from './saleWorkspace.types'
import { useSaleForm } from './useSaleForm'
import { useSalesData } from './useSalesData'
import './SaleWorkspace.css'

export function SaleWorkspace({ onNotice }: { onNotice: (message: string) => void }) {
  const data = useSalesData(onNotice)
  const form = useSaleForm({
    enabledProductSales: data.enabledProductSales,
    farms: data.farms,
    load: data.load,
    onNotice,
    products: data.products,
  })
  const [promotionFilter, setPromotionFilter] = useState<SaleStatus>('active')

  return (
    <section
      className="user-workspace farmer-workspace sale-workspace"
      aria-labelledby="sales-discounts-title"
    >
      <SaleHeaderSummary onCreate={form.openCreate} summary={data.summary} />
      <SaleEditDialog form={form} />
      <SaleCreateDialog form={form} />
      <SaleManagement
        busySaleId={data.busySaleId}
        counts={data.promotionCounts}
        farms={data.farms}
        filter={promotionFilter}
        onEdit={form.edit}
        onFilterChange={setPromotionFilter}
        onRemove={(sale) =>
          void data.remove(sale, () => {
            if (form.editingSaleId === sale.id) form.resetForm()
          })
        }
        onToggle={(sale) => void data.toggle(sale)}
        sales={data.sales}
        statusById={data.statusById}
      />
      <SaleProductOverview items={data.productsOnSale} />
    </section>
  )
}
