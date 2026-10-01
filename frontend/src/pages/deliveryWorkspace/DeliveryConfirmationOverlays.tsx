import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/ui/icon/Icon'
import { DeliveryLocationIcon } from './DeliveryLocationIcon'
import type { DeliveryActionsState } from './useDeliveryActions'
import { scheduleParts } from './deliveryWorkspace.utils'

export function DeliveryConfirmationOverlays({ actions }: { actions: DeliveryActionsState }) {
  const modalOpen = Boolean(
    actions.completionDelivery || actions.cancellationDelivery || actions.deletionDelivery,
  )
  const closeCompletion = useCallback(() => {
    if (!actions.completing) {
      actions.setCompletionId(null)
      actions.setCompletionError('')
    }
  }, [actions])
  const closeCancellation = useCallback(() => {
    if (!actions.cancelling) {
      actions.setCancellationId(null)
      actions.setCancellationReason('')
      actions.setCancellationError('')
    }
  }, [actions])
  const closeDeletion = useCallback(() => {
    if (!actions.deleting) {
      actions.setDeletionId(null)
      actions.setDeletionError('')
    }
  }, [actions])
  useEffect(() => {
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (actions.completionDelivery) closeCompletion()
      else if (actions.cancellationDelivery) closeCancellation()
      else if (actions.deletionDelivery) closeDeletion()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', close)
    }
  }, [actions, closeCancellation, closeCompletion, closeDeletion, modalOpen])
  return (
    <>
      {actions.completionDelivery &&
        createPortal(
          <div
            className="delivery-complete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-complete-title"
          >
            <div className="delivery-complete-backdrop" onMouseDown={closeCompletion} />
            <section className="delivery-complete-modal">
              <button
                className="delivery-complete-close"
                type="button"
                onClick={closeCompletion}
                disabled={actions.completing}
                aria-label="Close completion confirmation"
              >
                <Icon name="close" size={22} />
              </button>
              <span className="delivery-complete-icon">
                <Icon name="check" size={34} />
              </span>
              <h2 id="delivery-complete-title">Mark as Completed</h2>
              <p className="delivery-complete-question">
                Are you sure you want to mark order
                <br />
                <strong>ORD-{actions.completionDelivery.order_id}</strong> as completed?
              </p>
              <div className="delivery-complete-summary">
                <div>
                  <Icon name="profile" size={23} />
                  <span>
                    <small>Rider</small>
                    <strong>{actions.completionDelivery.rider_name || 'Unassigned'}</strong>
                  </span>
                </div>
                <div>
                  <DeliveryLocationIcon />
                  <span>
                    <small>Destination</small>
                    <strong>{actions.completionDelivery.dropoff_location || 'Not set'}</strong>
                  </span>
                </div>
                <div>
                  <Icon name="calendar" size={23} />
                  <span>
                    <small>Schedule</small>
                    <strong>
                      {scheduleParts(actions.completionDelivery.estimated_delivery_time).join(' ')}
                    </strong>
                  </span>
                </div>
              </div>
              <p className="delivery-complete-note">
                <Icon name="alert" size={19} />
                <span>
                  This delivery will be moved to your completed deliveries history or its status
                  will be updated in the list.
                </span>
              </p>
              {actions.completionError && (
                <p className="delivery-complete-error" role="alert">
                  {actions.completionError}
                </p>
              )}
              <footer>
                <button type="button" onClick={closeCompletion} disabled={actions.completing}>
                  Cancel
                </button>
                <button
                  className="confirm"
                  type="button"
                  onClick={() => {
                    void actions.confirmCompletion()
                  }}
                  disabled={actions.completing}
                >
                  {actions.completing ? 'Completing…' : 'Mark as Completed'}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {actions.cancellationDelivery &&
        createPortal(
          <div className="delivery-cancel-overlay">
            <div className="delivery-cancel-backdrop" onMouseDown={closeCancellation} />
            <section
              className="delivery-cancel-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delivery-cancel-title"
              aria-describedby="delivery-cancel-description"
            >
              <button
                className="delivery-cancel-close"
                type="button"
                onClick={closeCancellation}
                disabled={actions.cancelling}
                aria-label="Close cancellation confirmation"
              >
                <Icon name="close" size={24} />
              </button>
              <header>
                <span className="delivery-cancel-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3 22 21H2L12 3Z" />
                    <path d="M12 9v5" />
                    <path d="M12 17.5h.01" />
                  </svg>
                </span>
                <div>
                  <h2 id="delivery-cancel-title">Cancel Delivery</h2>
                  <p id="delivery-cancel-description">
                    Are you sure you want to cancel this delivery?
                  </p>
                </div>
              </header>
              <div className="delivery-cancel-warning">
                <strong>Order: ORD-{actions.cancellationDelivery.order_id}</strong>
                <p>
                  The rider and buyer may be notified about this cancellation.
                  <br />
                  This action cannot be easily undone.
                </p>
              </div>
              <label className="delivery-cancel-reason">
                <span>Reason for cancellation (optional)</span>
                <textarea
                  autoFocus
                  value={actions.cancellationReason}
                  onChange={(event) => actions.setCancellationReason(event.target.value)}
                  maxLength={500}
                  disabled={actions.cancelling}
                  placeholder="Enter reason for cancellation..."
                />
                <small>{actions.cancellationReason.length}/500</small>
              </label>
              {actions.cancellationError && (
                <p className="delivery-cancel-error" role="alert">
                  {actions.cancellationError}
                </p>
              )}
              <footer>
                <button type="button" onClick={closeCancellation} disabled={actions.cancelling}>
                  Back
                </button>
                <button
                  className="confirm"
                  type="button"
                  onClick={() => {
                    void actions.confirmCancellation()
                  }}
                  disabled={actions.cancelling}
                >
                  <Icon name="trash" size={20} />
                  {actions.cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {actions.deletionDelivery &&
        createPortal(
          <div
            className="delivery-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-delete-title"
          >
            <div className="delivery-delete-backdrop" onMouseDown={closeDeletion} />
            <section className="delivery-delete-modal">
              <button
                className="delivery-delete-close"
                type="button"
                onClick={closeDeletion}
                disabled={actions.deleting}
                aria-label="Close delete confirmation"
              >
                <Icon name="close" size={22} />
              </button>
              <span className="delivery-delete-icon">
                <Icon name="trash" size={31} />
              </span>
              <h2 id="delivery-delete-title">Delete Delivery</h2>
              <p className="delivery-delete-subtitle">
                This action is permanent and cannot be undone.
              </p>
              <div className="delivery-delete-warning">
                <Icon name="alert" size={28} />
                <p>
                  <strong>Warning:</strong> Deleting this delivery will permanently remove it from
                  your records. This action cannot be undone.
                </p>
              </div>
              <div className="delivery-delete-summary">
                <div>
                  <small>Order ID</small>
                  <strong>ORD-{actions.deletionDelivery.order_id}</strong>
                </div>
                <div>
                  <small>Rider</small>
                  <strong>{actions.deletionDelivery.rider_name || 'Unassigned'}</strong>
                </div>
                <div>
                  <small>Pickup</small>
                  <strong>
                    <DeliveryLocationIcon />
                    {actions.deletionDelivery.pickup_location || 'Not set'}
                  </strong>
                </div>
              </div>
              {actions.deletionError && (
                <p className="delivery-delete-error" role="alert">
                  {actions.deletionError}
                </p>
              )}
              <footer>
                <button type="button" onClick={closeDeletion} disabled={actions.deleting}>
                  Cancel
                </button>
                <button
                  className="confirm"
                  type="button"
                  onClick={() => {
                    void actions.confirmDeletion()
                  }}
                  disabled={actions.deleting}
                >
                  <Icon name="trash" size={20} />
                  {actions.deleting ? 'Deleting…' : 'Delete Delivery'}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}
