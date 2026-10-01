import type { OrderFilter } from '../../../types/dashboard'
import { Icon } from '../icon/Icon'

type OrderControlsProps = {
  activeFilter: OrderFilter
  filters: OrderFilter[]
  hasActiveOrderFilters: boolean
  hasDownloadableOrders: boolean
  orderQuery: string
  sortDirection: 'asc' | 'desc'
  statusCounts: Record<OrderFilter, number>
  onClearFilters: () => void
  onCreateOrder: () => void
  onDownload: () => void
  onFilterChange: (filter: OrderFilter) => void
  onQueryChange: (query: string) => void
  onToggleSortDirection: () => void
}

export function OrderControls({
  activeFilter,
  filters,
  hasActiveOrderFilters,
  hasDownloadableOrders,
  orderQuery,
  sortDirection,
  statusCounts,
  onClearFilters,
  onCreateOrder,
  onDownload,
  onFilterChange,
  onQueryChange,
  onToggleSortDirection,
}: OrderControlsProps) {
  return (
    <div className="order-list-controls dashboard-filter-grid">
      <label className="dashboard-filter-field">
        <span>Search</span>
        <span className="order-search-field dashboard-filter-control">
          <Icon name="search" size={15} />
          <input
            type="search"
            placeholder="Orders..."
            value={orderQuery}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </span>
      </label>
      <label className="dashboard-filter-field">
        <span>Status</span>
        <select
          value={activeFilter}
          onChange={(event) => onFilterChange(event.target.value as OrderFilter)}
        >
          {filters.map((filter) => (
            <option key={filter} value={filter}>{filter} ({statusCounts[filter]})</option>
          ))}
        </select>
      </label>
      <div className="order-table-actions dashboard-filter-actions">
        <button
          className="order-create-button"
          type="button"
          onClick={onCreateOrder}
        >
          <Icon name="plus" size={14} />
          Create manual order
        </button>
        <button
          className="order-sort-button"
          type="button"
          onClick={onToggleSortDirection}
          aria-label={`Sort orders ${sortDirection === 'desc' ? 'oldest first' : 'newest first'}`}
        >
          <Icon name="calendar" size={15} />
          {sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
          <Icon name="chevron" size={14} />
        </button>
        <button
          className="order-download-button"
          type="button"
          disabled={!hasDownloadableOrders}
          onClick={onDownload}
        >
          Download <Icon name="download" size={15} />
        </button>
        <button
          className="order-tool-button"
          type="button"
          disabled={!hasActiveOrderFilters}
          onClick={onClearFilters}
          aria-label="Clear search and status filters"
        >
          <Icon name="filter" size={15} />
          Clear
        </button>
      </div>
    </div>
  )
}
