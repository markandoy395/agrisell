import type {
  OrderFilter,
} from "../../../types/dashboard";
import { Icon } from "../icon/Icon";

type OrderControlsProps = {
  activeFilter: OrderFilter;
  filters: OrderFilter[];
  hasActiveOrderFilters: boolean;
  orderQuery: string;
  statusCounts: Record<OrderFilter, number>;
  onClearFilters: () => void;
  onFilterChange: (filter: OrderFilter) => void;
  onQueryChange: (query: string) => void;
};

export function OrderControls({
  activeFilter,
  filters,
  hasActiveOrderFilters,
  orderQuery,
  statusCounts,
  onClearFilters,
  onFilterChange,
  onQueryChange,
}: OrderControlsProps) {
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
            <Icon
              name={
                filter === "All"
                  ? "route"
                  : filter === "Success"
                    ? "check"
                    : filter === "Pending"
                      ? "calendar"
                      : "alert"
              }
              size={14}
            />
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
            placeholder="Search orders..."
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
      </div>
    </div>
  );
}
