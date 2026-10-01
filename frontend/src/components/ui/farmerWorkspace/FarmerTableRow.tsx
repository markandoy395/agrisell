import type { EntityRecord, FarmerFarm } from '../../../types/dashboard'
import {
  getFarmerCommoditySummary,
  getFarmerHectareSummary,
  getFarmerInitials,
  getFarmerLocationSummary,
  getFarmerRecordKey,
} from '../../../utils/farmerWorkspace'
import { Icon } from '../icon/Icon'

type FarmerTableRowProps = {
  farmer: EntityRecord
  farms: FarmerFarm[]
  isSelected: boolean
  onApprove: (farmer: EntityRecord) => Promise<void>
  onOpen: (farmer: EntityRecord) => void
  onToggleSelection: (recordKey: string) => void
}

export function FarmerTableRow({
  farmer,
  farms,
  isSelected,
  onApprove,
  onOpen,
  onToggleSelection,
}: FarmerTableRowProps) {
  const recordKey = getFarmerRecordKey(farmer)
  const isVerified = farmer.status === 'Verified'
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelection(recordKey)}
          aria-label={`Select ${farmer.primary}`}
        />
      </td>
      <td>
        <span className="user-identity">
          <span className="user-avatar" aria-hidden="true">
            {getFarmerInitials(farmer)}
          </span>
          <span>
            <strong>{farmer.primary}</strong>
            <small>{farmer.entityId ?? farmer.secondary}</small>
          </span>
        </span>
      </td>
      <td>
        <strong>{farmer.category}</strong>
        <small>{farmer.secondary}</small>
      </td>
      <td>
        <strong>{farmer.value}</strong>
        <small>{getFarmerHectareSummary(farms)}</small>
      </td>
      <td>
        <strong>{getFarmerLocationSummary(farms)}</strong>
        <small>{farms[0]?.farmName ?? 'No registered farm profile'}</small>
      </td>
      <td>
        <strong>{getFarmerCommoditySummary(farms)}</strong>
        <small>{farms.length} farm profiles</small>
      </td>
      <td>
        <span className={`user-status ${farmer.tone}`}>
          <i aria-hidden="true" />
          {farmer.status}
        </span>
      </td>
      <td>
        <div className="farmer-row-actions">
          <button
            className="icon-action-button"
            type="button"
            disabled={isVerified || !farmer.entityId}
            aria-label={isVerified ? `${farmer.primary} is approved` : `Approve ${farmer.primary}`}
            title={isVerified ? 'Approved' : 'Approve'}
            onClick={() => void onApprove(farmer).catch(() => undefined)}
          >
            <Icon name="check" size={17} />
          </button>
          <button
            className="user-row-action"
            type="button"
            aria-label={
              farmer.entityId ? `View farms for ${farmer.primary}` : `Open ${farmer.primary}`
            }
            onClick={() => onOpen(farmer)}
          >
            <Icon name="more" size={18} />
          </button>
        </div>
      </td>
    </tr>
  )
}
