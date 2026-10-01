import { Icon } from '../../components/ui/icon/Icon'
import type { CommodityFilterState } from '../../types/commodityWorkspace'

type CommodityControlsProps = {
  categories: string[]
  filters: CommodityFilterState
  isRefreshing: boolean
  onAddProduct: () => void
  onCategoryChange: (category: string) => void
  onProductionStatusChange: (productionStatus: string) => void
  onRefresh: () => void
  onSearchChange: (search: string) => void
  onStatusChange: (status: string) => void
}

export function CommodityControls({
  categories,
  filters,
  isRefreshing,
  onAddProduct,
  onCategoryChange,
  onProductionStatusChange,
  onRefresh,
  onSearchChange,
  onStatusChange,
}: CommodityControlsProps) {
  return (
    <div className="commodity-controls-bar dashboard-filter-grid">
      <label className="dashboard-filter-field">
        <span>Search</span>
        <span className="commodity-search-box dashboard-filter-control">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Products, farms..."
            value={filters.search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {filters.search && (
            <button
              type="button"
              className="commodity-search-clear"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </span>
      </label>

        <label className="commodity-filter-group dashboard-filter-field">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(e) => onStatusChange(e.target.value)}
            aria-label="Filter by listing status"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="hidden">Hidden</option>
            <option value="delisted">Delisted</option>
            <option value="out_of_stock">Out of stock</option>
            <option value="pending_approval">Pending approval</option>
          </select>
        </label>

        <label className="commodity-filter-group dashboard-filter-field">
          <span>Stage</span>
          <select
            value={filters.productionStatus}
            onChange={(e) => onProductionStatusChange(e.target.value)}
            aria-label="Filter by production stage"
          >
            <option value="all">All stages</option>
            <option value="harvested">Harvested</option>
            <option value="harvesting_soon">Harvesting soon</option>
            <option value="growing">Growing</option>
          </select>
        </label>

        <label className="commodity-filter-group dashboard-filter-field">
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

      <div className="commodity-filter-actions dashboard-filter-actions">
        <button
          className="commodity-secondary-button"
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          Refresh catalog
        </button>
        <button className="commodity-primary-button" type="button" onClick={onAddProduct}>
          <Icon name="plus" size={16} />
          Add Product
        </button>
      </div>
    </div>
  )
}
