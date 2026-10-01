import { createPortal } from 'react-dom'
import { Icon } from '../../components/ui/icon/Icon'
import type { DeliveryActionsState } from './useDeliveryActions'
import {
  canAssignDelivery,
  canCancelDelivery,
  isFailedDelivery,
  isRecreatableDelivery,
  isSuccessfulDelivery,
} from '../../utils/delivery'
import { printDeliveryWaybill } from './deliveryWorkspace.utils'

export function DeliveryActionMenu({ actions }: { actions: DeliveryActionsState }) {
  if (!actions.actionMenu || !actions.actionDelivery) return null
  const delivery = actions.actionDelivery
  const successful = isSuccessfulDelivery(delivery.delivery_status)
  const failed = isFailedDelivery(delivery.delivery_status)
  const recreatable = isRecreatableDelivery(delivery.delivery_status)
  const active = !successful && !failed && !recreatable
  const assignable = active && canAssignDelivery(delivery.delivery_status)
  return createPortal(
    <div className="delivery-action-layer">
      <div className="delivery-action-backdrop" onMouseDown={() => actions.setActionMenu(null)} />
      <div
        className="delivery-action-menu"
        role="menu"
        aria-label={`Delivery ${delivery.delivery_id} actions`}
        style={{ top: actions.actionMenu.top, right: actions.actionMenu.right }}
      >
        <button type="button" role="menuitem" onClick={() => actions.selectFromMenu('details')}>
          <Icon name="eye" size={19} />
          View details
        </button>
        {active && (
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              actions.openSimpleAction(actions.setEditId, () => actions.setEditError(''))
            }
          >
            <Icon name="edit" size={19} />
            Edit delivery / Reschedule
          </button>
        )}
        {assignable && (
          <button type="button" role="menuitem" onClick={actions.openAssignment}>
            <Icon name="profile" size={19} />
            {delivery.rider_id ? 'Reassign courier' : 'Assign courier'}
          </button>
        )}
        {(active || successful) && (
          <button type="button" role="menuitem" onClick={() => actions.selectFromMenu('route')}>
            <Icon name="route" size={19} />
            {successful ? 'View route' : 'Track order'}
          </button>
        )}
        {successful && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              printDeliveryWaybill(delivery)
              actions.setActionMenu(null)
            }}
          >
            <Icon name="printer" size={19} />
            Print waybill
          </button>
        )}
        {(failed || recreatable) && (
          <button
            type="button"
            role="menuitem"
            disabled={actions.reopeningId !== null}
            onClick={() => void actions.reopenDelivery()}
          >
            <Icon name="refresh" size={19} />
            {actions.reopeningId === delivery.delivery_id
              ? 'Reopening...'
              : failed
                ? 'Retry delivery'
                : 'Recreate delivery'}
          </button>
        )}
        {active && canCancelDelivery(delivery.delivery_status) && (
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              actions.openSimpleAction(actions.setCancellationId, () => {
                actions.setCancellationReason('')
                actions.setCancellationError('')
              })
            }
          >
            <Icon name="close" size={19} />
            Cancel delivery
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="danger separated"
          onClick={() =>
            actions.openSimpleAction(actions.setDeletionId, () => actions.setDeletionError(''))
          }
        >
          <Icon name="trash" size={19} />
          Delete delivery
        </button>
      </div>
    </div>,
    document.body,
  )
}
