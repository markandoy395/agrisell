import { Icon } from '../../components/ui/icon/Icon'
import { WorkspaceStatsGrid } from '../../components/ui/workspaceStats/WorkspaceStatsGrid'
import type { SaleSummary } from './saleWorkspace.types'

type SaleHeaderSummaryProps = {
  onCreate: () => void
  summary: SaleSummary
}

export function SaleHeaderSummary({ onCreate, summary }: SaleHeaderSummaryProps) {
  return (
    <>
      <header className="sale-page-header">
        <div>
          <span className="sale-eyebrow">SALES MANAGEMENT</span>
          <h1 id="sales-discounts-title">Sales &amp; Discounts</h1>
          <p>Manage platform-wide campaigns and monitor farmer-scoped promotions safely.</p>
        </div>
        <div className="sale-header-actions">
          <span className="sale-price-safety">
            <Icon name="lock" size={14} /> Base prices protected
          </span>
          <button
            className="sale-primary-button sale-header-button"
            type="button"
            onClick={onCreate}
          >
            <Icon name="plus" size={15} /> Create sale
          </button>
        </div>
      </header>
      <WorkspaceStatsGrid
        ariaLabel="Sales overview"
        cards={[
          {
            detail: `${summary.platformSales} platform · ${summary.farmerSales} farmer`,
            icon: 'trend',
            label: 'Active sales',
            trend: 'Live',
            value: summary.active,
          },
          {
            detail: 'Unique discounted products',
            icon: 'basket',
            label: 'Products on sale',
            trend: 'Live',
            value: summary.products,
          },
          {
            detail: 'Introductory promotions',
            icon: 'users',
            label: 'New-user offers',
            trend: 'Live',
            value: summary.newUser,
          },
          {
            detail: 'Upcoming promotions',
            icon: 'calendar',
            label: 'Scheduled sales',
            trend: 'Live',
            value: summary.scheduled,
          },
        ]}
      />
    </>
  )
}
