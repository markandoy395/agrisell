import type {
  OrderFilter,
  OrderSortDirection,
} from "../../../types/dashboard";
import { Icon } from "../icon/Icon";

type OrderControlsProps = {
  activeFilter: OrderFilter;
  filters: OrderFilter[];
  hasActiveOrderFilters: boolean;
  hasDownloadableOrders: boolean;
  orderQuery: string;
  sortDirection: OrderSortDirection;
  statusCounts: Record<OrderFilter, number>;
  onClearFilters: () => void;
  onDownload: () => void;
  onFilterChange: (filter: OrderFilter) => void;
  onQueryChange: (query: string) => void;
  onSortToggle: () => void;
};

export function OrderControls({
  activeFilter,
  filters,
  hasActiveOrderFilters,
  hasDownloadableOrders,
  orderQuery,
  sortDirection,
  statusCounts,
  onClearFilters,
  onDownload,
  onFilterChange,
  onQueryChange,
  onSortToggle,
}: OrderControlsProps) {
  const sortLabel = sortDirection === "desc" ? "Newest first" : "Oldest first";
  const nextSortLabel =
    sortDirection === "desc" ? "oldest first" : "newest first";

  return (
    <div className="order-list-controls">
      <div
        className="order-filter-tabs"
        role="group"
        aria-label="Filter orders by status"
      >
        {filters.map((filter) => (
          <button
            className={`order-filter-tab ${
              activeFilter === filter ? "is-active" : ""
            }`}
            type="button"
            aria-pressed={activeFilter === filter}
            aria-label={`${filter} orders, ${statusCounts[filter]} shown`}
            key={filter}
            onClick={() => onFilterChange(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="order-table-actions">
        <label className="order-search-field">
          <span className="sr-only">Search orders</span>
          <Icon name="search" size={15} />
          <input
            type="search"
            placeholder="Search"
            value={orderQuery}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
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
        <button
          className="order-tool-button"
          type="button"
          onClick={onSortToggle}
          aria-label={`Sort orders ${nextSortLabel}`}
        >
          <Icon name="sort" size={15} />
          {sortLabel}
        </button>
        <button
          className="order-download-button"
          type="button"
          disabled={!hasDownloadableOrders}
          onClick={onDownload}
          aria-label="Download filtered orders"
        >
          Download
          <Icon name="download" size={15} />
        </button>
      </div>
    </div>
  );
}
