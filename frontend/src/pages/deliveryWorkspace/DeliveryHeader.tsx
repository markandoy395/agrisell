import { Icon } from '../../components/ui/icon/Icon'
import type { DeliveryDataState } from './useDeliveryData'
import { downloadDeliveries } from './deliveryWorkspace.utils'

type DeliveryHeaderProps = {
  data: DeliveryDataState
  onCreate: () => void
}

export function DeliveryHeader({ data, onCreate }: DeliveryHeaderProps) {
  return (
    <header className="order-workspace-header delivery-workspace-header">
      <div className="order-heading-main">
        <span className="order-heading-icon" aria-hidden="true">
          <Icon name="truck" size={25} />
        </span>
        <div>
          <h1 id="deliveries-title">Deliveries</h1>
          <p>Monitor and manage every delivery in one place.</p>
        </div>
      </div>
      <div className="order-header-actions">
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
          className="delivery-header-refresh"
          type="button"
          disabled={data.loading}
          onClick={() => void data.refresh()}
          aria-label="Refresh"
          title="Refresh deliveries"
        >
          <Icon name="refresh" size={16} />
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
      </div>
    </header>
  )
}
