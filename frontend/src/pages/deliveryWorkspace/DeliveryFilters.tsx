import { Icon } from '../../components/ui/icon/Icon'
import { label } from '../../utils/delivery'
import type { DeliveryDataState } from './useDeliveryData'
import { downloadDeliveries } from './deliveryWorkspace.utils'

export function DeliveryFilters({ data, onCreate }: { data: DeliveryDataState; onCreate: () => void }) {
  return (
    <div className="order-list-controls delivery-filters dashboard-filter-grid" onChange={() => data.setPage(1)}>
      <label className="delivery-list-search dashboard-filter-field">
        <span>Search</span>
        <span className="dashboard-filter-control">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={data.query}
            onChange={(event) => data.setQuery(event.target.value)}
            placeholder="Rider, order, destination..."
          />
        </span>
      </label>
      <label className="delivery-filter-select dashboard-filter-field">
        <span>Status</span>
        <select value={data.status} onChange={(event) => data.setStatus(event.target.value)}>
          <option value="">All Status</option>
          {[...new Set(data.deliveries.map((delivery) => delivery.delivery_status))]
            .sort()
            .map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
        </select>
      </label>
      <label className="delivery-filter-select dashboard-filter-field">
        <span>Rider</span>
        <select value={data.rider} onChange={(event) => data.setRider(event.target.value)}>
          <option value="">All Riders</option>
          <option value="unassigned">Unassigned</option>
          {data.options.riders.map((rider) => (
            <option key={rider.rider_id} value={rider.rider_id}>
              {rider.full_name}
            </option>
          ))}
        </select>
      </label>
      <label className={`delivery-date-filter dashboard-filter-field ${data.from ? 'has-value' : ''}`}>
        <span>Date</span>
        <span className="dashboard-filter-control">
          <Icon name="calendar" size={15} />
          <span aria-hidden="true">
            {data.from
              ? new Date(`${data.from}T00:00:00`).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Select date'}
          </span>
          <input
            aria-label="Select date"
            type="date"
            value={data.from}
            onChange={(event) => {
              data.setFrom(event.target.value)
              data.setTo(event.target.value)
            }}
          />
        </span>
      </label>
      <div className="dashboard-filter-actions">
        <label className={`delivery-checkbox delivery-overdue-filter${data.overdue ? ' is-checked' : ''}`}>
          <input
            type="checkbox"
            checked={data.overdue}
            onChange={(event) => data.setOverdue(event.target.checked)}
          />
          <span className="sr-only">Overdue only</span>
        </label>
        <button
          className="order-sort-button"
          type="button"
          onClick={() => data.setSortDirection((value) => (value === 'desc' ? 'asc' : 'desc'))}
          aria-label={`Sort deliveries ${data.sortDirection === 'desc' ? 'oldest first' : 'newest first'}`}
        >
          <Icon name="calendar" size={15} />
          {data.sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
          <Icon name="chevron" size={14} />
        </button>
        <button
          className="order-download-button"
          type="button"
          aria-label="Download CSV"
          disabled={!data.filtered.length}
          onClick={() => downloadDeliveries(data.filtered)}
        >
          Download <Icon name="download" size={15} />
        </button>
        <button
          type="button"
          className="delivery-primary delivery-add-button"
          aria-label="Add delivery"
          disabled={data.loading || Boolean(data.error)}
          onClick={onCreate}
        >
          <Icon name="plus" size={17} />
          Add Delivery
        </button>
        <button
          className="delivery-header-refresh"
          type="button"
          disabled={data.loading}
          onClick={() => void data.refresh()}
          aria-label="Refresh"
          title="Refresh deliveries"
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
    </div>
  )
}
