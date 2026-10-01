import type { EntityRecord, FarmerFarmLookup } from '../../../types/dashboard'
import { farmerPageSize } from '../../../utils/farmerWorkspace'
import { Icon } from '../icon/Icon'
import { FarmerTableRow } from './FarmerTableRow'
import './FarmerTable.css'

type FarmerTableProps = {
  activePage: number
  allVisibleSelected: boolean
  farmerFarmLookup: FarmerFarmLookup
  farmers: EntityRecord[]
  pageNumbers: number[]
  selectedFarmerRecordKeys: Set<string>
  totalCount: number
  totalPages: number
  onApproveFarmer: (farmer: EntityRecord) => Promise<void>
  onOpenFarmer: (farmer: EntityRecord) => void
  onPageChange: (page: number | ((currentPage: number) => number)) => void
  onToggleAllVisible: () => void
  onToggleFarmerSelection: (recordKey: string) => void
}

export function FarmerTable({
  activePage,
  allVisibleSelected,
  farmerFarmLookup,
  farmers,
  pageNumbers,
  selectedFarmerRecordKeys,
  totalCount,
  totalPages,
  onApproveFarmer,
  onOpenFarmer,
  onPageChange,
  onToggleAllVisible,
  onToggleFarmerSelection,
}: FarmerTableProps) {
  return (
    <div className="user-table-panel">
      <div className="user-table-wrap">
        <table className="user-table farmer-table">
          <colgroup>
            <col className="farmer-col-select" />
            <col className="farmer-col-name" />
            <col className="farmer-col-specialty" />
            <col className="farmer-col-farms" />
            <col className="farmer-col-location" />
            <col className="farmer-col-commodities" />
            <col className="farmer-col-status" />
            <col className="farmer-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleAllVisible}
                  aria-label="Select all visible farmers"
                />
              </th>
              <th>farmer_user_id / name</th>
              <th>specialty</th>
              <th>registered_farms</th>
              <th>farm_locations</th>
              <th>commodities</th>
              <th>verification</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {farmers.map((farmer) => (
              <FarmerTableRow
                key={farmer.entityId ?? `${farmer.primary}-${farmer.secondary}`}
                farmer={farmer}
                farms={farmer.entityId ? (farmerFarmLookup[farmer.entityId] ?? []) : []}
                isSelected={selectedFarmerRecordKeys.has(
                  farmer.entityId ?? `${farmer.primary}-${farmer.secondary}`,
                )}
                onApprove={onApproveFarmer}
                onOpen={onOpenFarmer}
                onToggleSelection={onToggleFarmerSelection}
              />
            ))}
          </tbody>
        </table>
        {farmers.length === 0 && <div className="user-empty-state">No matching farmers found.</div>}
      </div>

      <div className="user-table-footer">
        <span>
          Showing {(activePage - 1) * farmerPageSize + (farmers.length ? 1 : 0)} to{' '}
          {(activePage - 1) * farmerPageSize + farmers.length} of {totalCount} farmers
        </span>
        <nav className="user-pagination" aria-label="Farmers pages">
          <button
            type="button"
            disabled={activePage === 1}
            onClick={() => onPageChange((page) => Math.max(1, page - 1))}
            aria-label="Previous page"
          >
            <Icon name="chevron" size={15} />
          </button>
          {pageNumbers.map((page) => (
            <button
              className={activePage === page ? 'is-active' : ''}
              type="button"
              key={page}
              onClick={() => onPageChange(page)}
              aria-current={activePage === page ? 'page' : undefined}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            disabled={activePage === totalPages}
            onClick={() => onPageChange((page) => Math.min(totalPages, page + 1))}
            aria-label="Next page"
          >
            <Icon name="chevron" size={15} />
          </button>
        </nav>
      </div>
    </div>
  )
}
