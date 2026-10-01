import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AssignRiderModal } from './AssignRiderModal'
import { DeliveryDetails } from './DeliveryDetails'
import { DeliveryInfoDetails } from './DeliveryInfoDetails'
import { DeliveryRouteDetails } from './DeliveryRouteDetails'
import { EditDeliveryModal } from './EditDeliveryModal'
import type { DeliveryActionsState } from './useDeliveryActions'
import type { DeliveryDataState } from './useDeliveryData'
import type { FarmerRiderRequest } from '../../types/delivery'

export function DeliveryDetailOverlays({
  actions,
  data,
  farmerRequests,
  onTrack,
}: {
  actions: DeliveryActionsState
  data: DeliveryDataState
  farmerRequests?: FarmerRiderRequest[]
  onTrack: (id: number) => void
}) {
  const modalOpen = Boolean(actions.selected || actions.assignmentDelivery || actions.editDelivery)
  useEffect(() => {
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [modalOpen])
  useEffect(() => {
    if (!modalOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (actions.assignmentDelivery && !actions.assignmentSaving) {
        actions.setAssignmentId(null)
        actions.setAssignmentError('')
      } else if (actions.editDelivery && !actions.editSaving) {
        actions.setEditId(null)
        actions.setEditError('')
      } else if (actions.selected && ['details', 'route'].includes(actions.selectedMode)) {
        actions.setSelectedId(null)
      }
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [actions, modalOpen])
  const closeAssignment = () => {
    if (!actions.assignmentSaving) {
      actions.setAssignmentId(null)
      actions.setAssignmentError('')
    }
  }
  const closeEdit = () => {
    if (!actions.editSaving) {
      actions.setEditId(null)
      actions.setEditError('')
    }
  }
  return (
    <>
      {actions.selected &&
        actions.selectedMode === 'route' &&
        createPortal(
          <div
            className="delivery-route-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Delivery ${actions.selected.delivery_id} route details`}
          >
            <div
              className="delivery-route-overlay-backdrop"
              onMouseDown={() => actions.setSelectedId(null)}
            />
            <div className="delivery-route-overlay-panel">
              <DeliveryRouteDetails
                delivery={actions.selected}
                onBack={() => actions.setSelectedId(null)}
              />
            </div>
          </div>,
          document.body,
        )}
      {actions.selected &&
        actions.selectedMode === 'details' &&
        createPortal(
          <div
            className="delivery-info-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Delivery ${actions.selected.delivery_id} details`}
          >
            <div
              className="delivery-info-backdrop"
              onMouseDown={() => actions.setSelectedId(null)}
            />
            <DeliveryInfoDetails
              delivery={actions.selected}
              onClose={() => actions.setSelectedId(null)}
              onEdit={() => {
                actions.setEditId(actions.selected!.delivery_id)
                actions.setSelectedId(null)
                actions.setEditError('')
              }}
            />
          </div>,
          document.body,
        )}
      {actions.assignmentDelivery &&
        createPortal(
          <div
            className="assign-rider-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Assign rider to order ORD-${actions.assignmentDelivery.order_id}`}
          >
            <div className="assign-rider-backdrop" onMouseDown={closeAssignment} />
            <AssignRiderModal
              delivery={actions.assignmentDelivery}
              riders={data.options.riders}
              query={actions.assignmentQuery}
              selectedRiderId={actions.assignmentRiderId}
              saving={actions.assignmentSaving}
              error={actions.assignmentError}
              farmerRequest={farmerRequests?.find(
                (r) => r.delivery_id === actions.assignmentDelivery?.delivery_id,
              )}
              onQueryChange={actions.setAssignmentQuery}
              onSelect={actions.setAssignmentRiderId}
              onClose={closeAssignment}
              onConfirm={() => {
                void actions.confirmAssignment()
              }}
            />
          </div>,
          document.body,
        )}
      {actions.editDelivery &&
        createPortal(
          <div
            className="edit-delivery-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit order ORD-${actions.editDelivery.order_id}`}
          >
            <div className="edit-delivery-backdrop" onMouseDown={closeEdit} />
            <EditDeliveryModal
              delivery={actions.editDelivery}
              saving={actions.editSaving}
              error={actions.editError}
              onClose={closeEdit}
              onSave={(values) => {
                void actions.confirmEdit(values)
              }}
            />
          </div>,
          document.body,
        )}
      {actions.selected && actions.selectedMode === 'manage' && (
        <DeliveryDetails
          key={`${actions.selected.delivery_id}-${data.reload}`}
          delivery={actions.selected}
          riders={data.options.riders}
          onClose={() => actions.setSelectedId(null)}
          onSaved={data.refresh}
          onTrack={() => onTrack(actions.selected!.delivery_id)}
        />
      )}
    </>
  )
}
