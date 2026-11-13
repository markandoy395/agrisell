import { useState } from 'react'
import { CommodityControls } from './CommodityControls'
import { CommodityCreateDialog } from './CommodityCreateDialog'
import { CommodityEditDialog } from './CommodityEditDialog'
import { CommodityHeaderSummary } from './CommodityHeaderSummary'
import { CommodityTable } from './CommodityTable'
import { useCommoditiesData } from './useCommoditiesData'
import type { CommodityCreatePayload } from '../../types/commodityWorkspace'
import './CommodityWorkspace.css'
import '../../styles/CatalogTypography.css'

type CommodityWorkspaceProps = {
  onNotice: (message: string) => void
}

export function CommodityWorkspace({ onNotice }: CommodityWorkspaceProps) {
  const data = useCommoditiesData(onNotice)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateSubmit = async (payload: CommodityCreatePayload) => {
    setIsCreating(true)
    try {
      await data.handleCreateCommodity(payload)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <section
      className="user-workspace farmer-workspace commodity-workspace"
      aria-labelledby="commodities-title"
    >
      <h1 className="user-workspace-title" id="commodities-title">
        Commodities
      </h1>
      <CommodityHeaderSummary summary={data.summary} />

      <CommodityControls
        categories={data.categories}
        filters={data.filters}
        isRefreshing={data.isRefreshing || data.isLoading}
        onAddProduct={() => setIsCreateOpen(true)}
        onCategoryChange={data.setCategoryFilter}
        onProductionStatusChange={data.setProductionStatusFilter}
        onRefresh={() => void data.load()}
        onSearchChange={data.setSearchQuery}
        onStatusChange={data.setStatusFilter}
      />

      {data.isLoading ? (
        <div className="commodity-loading-state" role="status">
          <div className="commodity-loading-spinner" />
          <p>Loading marketplace catalog...</p>
        </div>
      ) : data.error ? (
        <div className="commodity-error-state" role="alert">
          <p>{data.error}</p>
          <button
            type="button"
            className="commodity-secondary-button"
            onClick={() => void data.load()}
          >
            Retry
          </button>
        </div>
      ) : (
        <CommodityTable
          busyCommodityId={data.busyCommodityId}
          commodities={data.commodities}
          currentPage={data.currentPage}
          filteredCount={data.filteredCount}
          totalPages={data.totalPages}
          onEdit={data.openEdit}
          onPageChange={data.setCurrentPage}
          onStatusChange={(commodity, status) => void data.handleStatusChange(commodity, status)}
        />
      )}

      <CommodityEditDialog
        commodity={data.editingCommodity}
        categories={data.categories}
        isSaving={Boolean(data.busyCommodityId)}
        onClose={data.closeEdit}
        onSave={data.handleSaveEdit}
      />
      <CommodityCreateDialog
        isOpen={isCreateOpen}
        categories={data.categories}
        farms={data.farms}
        isCreating={isCreating}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateSubmit}
      />
    </section>
  )
}
