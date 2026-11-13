import { useState } from 'react'
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
  const [isApproving, setIsApproving] = useState(false)
  const handleApprove = async () => {
    setIsApproving(true)
    try {
      await onApprove(farmer)
    } catch {
      // The workspace reports approval errors to the administrator.
    } finally {
      setIsApproving(false)
    }
  }
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
            <strong title={farmer.primary}>{farmer.primary}</strong>
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
          {!isVerified && farmer.entityId && (
            <button
              className="farmer-row-approve"
              type="button"
              disabled={isApproving}
              aria-label={`Approve ${farmer.primary}`}
              aria-busy={isApproving}
              onClick={() => void handleApprove()}
            >
              <Icon name="check" size={15} />
              {isApproving ? 'Approving…' : 'Approve'}
            </button>
          )}
          <button
            className="farmer-row-view"
            type="button"
            aria-label={
              farmer.entityId ? `View farms for ${farmer.primary}` : `Open ${farmer.primary}`
            }
            onClick={() => onOpen(farmer)}
          >
            {farmer.entityId ? 'View farms' : 'View details'}
          </button>
        </div>
      </td>
    </tr>
  )
}
