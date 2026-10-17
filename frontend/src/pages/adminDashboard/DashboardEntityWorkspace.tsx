import {
  approveFarmerProfile,
  reviewVerification,
  moderateReview,
  requestFarmerInformation,
  respondToReview,
} from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { AdminDatabaseData } from '../../types/adminData'
import { EntityWorkspace } from '../entityWorkspace/EntityWorkspace'
import { FarmerWorkspace } from '../farmerWorkspace/FarmerWorkspace'
import { LogisticsWorkspace } from '../logisticsWorkspace/LogisticsWorkspace'
import type { AdminDashboardState } from './useAdminDashboardState'

type DashboardEntityWorkspaceProps = {
  data: AdminDatabaseData
  state: AdminDashboardState
}

export function DashboardEntityWorkspace({ data, state }: DashboardEntityWorkspaceProps) {
  if (state.activeNav === 'Farmers') {
    return (
      <FarmerWorkspace
        farmers={data.farmers}
        farms={data.farmerFarms}
        search={state.search}
        created={[]}
        onAdd={() => state.setCreateUserType('farmer')}
        onOpen={state.openRecord}
        onReviewAction={async (action, farmer) => {
          try {
            if (action === 'approved') {
              await approveFarmerProfile(farmer.entityId ?? '')
              await state.database.refresh()
            } else {
              await requestFarmerInformation(farmer.entityId ?? '')
            }
            state.notifyUpdate(
              action === 'approved' ? 'Farmer approved' : 'Information requested',
              action === 'approved'
                ? `${farmer.primary} is now verified and ready to sell.`
                : `Requested verification information from ${farmer.primary}.`,
            )
          } catch (error) {
            state.showToast(
              getApiErrorMessage(
                error,
                'The farmer approval could not be saved. Please try again.',
              ),
            )
            throw error
          }
        }}
        onOpenVerification={(farmer) =>
          state.setVerificationTarget({
            entity: farmer,
            type: 'farmer',
          })
        }
      />
    )
  }
  if (state.activeNav === 'Logistics Companies' || state.activeNav === 'Riders') {
    return (
      <LogisticsWorkspace
        created={[]}
        records={
          data.entityRows[state.activeNav] ??
          data.entityRows.Riders ??
          data.entityRows['Logistics Companies'] ??
          []
        }
        search={state.search}
        onAdd={() =>
          state.setAddSection(
            state.activeNav === 'Logistics Companies' ? 'Riders' : state.activeNav,
          )
        }
        onApproveRider={async (rider, message) => {
          try {
            if (!rider.entityId) throw new Error('This rider has no saved profile to approve.')
            await reviewVerification('rider', rider.entityId, { action: 'verified', message })
            await state.database.refresh()
            state.notifyUpdate(
              'Rider approved',
              `${rider.primary} can now be activated for delivery work.`,
            )
          } catch (error) {
            state.showToast(
              getApiErrorMessage(error, 'The rider approval could not be saved. Please try again.'),
            )
            throw error
          }
        }}
        onOpen={(rider) => state.setVerificationTarget({ entity: rider, type: 'rider' })}
        onRejectRider={async (rider, reason) => {
          try {
            if (!rider.entityId) throw new Error('This rider has no saved profile to reject.')
            await reviewVerification('rider', rider.entityId, { action: 'rejected', reason })
            await state.database.refresh()
            state.notifyUpdate('Rider rejected', `${rider.primary}'s application was rejected.`)
          } catch (error) {
            state.showToast(getApiErrorMessage(error, 'The rider rejection could not be saved.'))
            throw error
          }
        }}
        onRiderSaved={async () => {
          await state.database.refresh()
          state.showToast('Rider profile updated.')
        }}
        onDeliveryAssigned={async (rider, orderId) => {
          await state.database.refresh()
          state.notifyUpdate(
            'Delivery assigned',
            `Order ORD-${orderId} was assigned to ${rider.primary}.`,
          )
        }}
        onDeleteRider={(rider) => {
          state.notifyUpdate('Rider removed', `${rider.primary} was removed from active roster.`)
        }}
      />
    )
  }
  return (
    <EntityWorkspace
      locationPins={state.locationPins}
      records={data.entityRows[state.activeNav] ?? []}
      section={state.activeNav}
      search={state.search}
      created={[]}
      activeOnly={state.activeOnly}
      period={state.period}
      onToggleFilter={() => state.setActiveOnly(!state.activeOnly)}
      onAdd={() => state.setAddSection(state.activeNav)}
      onOpen={state.openRecord}
      onReviewResponse={async (mode, review, message) => {
        const reviewType = review.reviewedType === 'Rider' ? 'rider' : 'farmer'
        await respondToReview(reviewType, review.entityId ?? '', mode, message)
        await state.database.refresh()
        state.notifyUpdate(
          mode === 'public' ? 'Comment posted' : 'Message sent',
          mode === 'public'
            ? 'Your public response was saved.'
            : 'Your direct message was sent to the reviewer.',
        )
      }}
      onReviewModeration={async (action, review, options) => {
        const reviewType = review.reviewedType === 'Rider' ? 'rider' : 'farmer'
        await moderateReview(reviewType, review.entityId ?? '', action, options)
        await state.database.refresh()
        state.notifyUpdate(
          'Moderation saved',
          'The review state and moderation history were updated.',
        )
      }}
    />
  )
}
