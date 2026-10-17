import type { FormEvent } from 'react'
import {
  createAdminRecord,
  createAdminUser,
  reviewVerification,
  updateAdminProfile,
  updateAdminUser,
  updateAdminUserStatus,
} from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { AuthenticatedAdmin } from '../../api/adminAuth'
import {
  UserAccountModal,
  VerificationReviewModal,
} from '../../components/ui/modals/AccountLifecycleModals'
import {
  AddRecordModal,
  CreateUserModal,
  DetailsModal,
  ProfileModal,
} from '../../components/ui/modals/DashboardModals'
import { BroadcastAnnouncementModal } from '../../components/ui/notifications/BroadcastAnnouncementModal'
import { getInitials } from './adminDashboard.utils'
import { AdminAccountTools } from '../../components/ui/modals/AdminAccountTools'

import type { AdminDashboardState } from './useAdminDashboardState'

type AdminDashboardDialogsProps = {
  admin: AuthenticatedAdmin
  state: AdminDashboardState
}

export function AdminDashboardDialogs({ admin, state }: AdminDashboardDialogsProps) {
  const createRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!state.addSection || !state.newRecordName.trim()) return
    const section = state.addSection
    const name = state.newRecordName.trim()
    try {
      await createAdminRecord(section, name)
      await state.database.refresh()
      state.setAddSection(null)
      state.setNewRecordName('')
      state.notifyUpdate(
        `New ${section.toLowerCase()} draft added`,
        `${name} was saved to ${section}.`,
      )
    } catch (error) {
      state.showToast(getApiErrorMessage(error, 'The record could not be saved.'))
    }
  }

  return (
    <>
      {state.accountTool && (
        <AdminAccountTools
          tool={state.accountTool}
          onClose={() => state.setAccountTool(null)}
          onPasswordChanged={() => {
            state.setAccountTool(null)
            state.showToast('Password changed. Other sessions were signed out.')
          }}
          onSuccess={state.showToast}
        />
      )}
      <DetailsModal modal={state.modal} onClose={() => state.setModal(null)} />
      <UserAccountModal
        user={state.selectedUser}
        onClose={() => state.setSelectedUser(null)}
        onSave={async (input) => {
          if (!state.selectedUser) return
          await updateAdminUser(state.selectedUser.userId, input)
          await state.database.refresh()
          state.notifyUpdate('User updated', 'The account profile was saved.')
        }}
        onStatus={async (status, reason) => {
          if (!state.selectedUser) return
          await updateAdminUserStatus(state.selectedUser.userId, status, reason)
          await state.database.refresh()
          state.notifyUpdate('Account status updated', `The account is now ${status}.`)
        }}
      />
      <VerificationReviewModal
        entity={state.verificationTarget?.entity ?? null}
        entityType={state.verificationTarget?.type ?? 'farmer'}
        initialDecision={state.verificationTarget?.initialDecision}
        onClose={() => state.setVerificationTarget(null)}
        onReview={async (input) => {
          if (!state.verificationTarget?.entity.entityId) return
          await reviewVerification(
            state.verificationTarget.type,
            state.verificationTarget.entity.entityId,
            input,
          )
          await state.database.refresh()
          state.notifyUpdate('Verification saved', 'The applicant was notified of the decision.')
        }}
      />
      <AddRecordModal
        section={state.addSection}
        name={state.newRecordName}
        onNameChange={state.setNewRecordName}
        onClose={() => state.setAddSection(null)}
        onSubmit={createRecord}
      />
      {state.createUserType && (
        <CreateUserModal
          defaultAccountType={state.createUserType}
          onClose={() => state.setCreateUserType(null)}
          onCreate={async (input) => {
            await createAdminUser(input)
            await state.database.refresh()
            state.notifyUpdate(
              input.accountType === 'farmer' ? 'Farmer account created' : 'User account created',
              `${input.firstName} ${input.lastName} can now sign in to Agrisell.`,
            )
          }}
        />
      )}
      {state.profileEditorOpen && (
        <ProfileModal
          permissions={admin.permissions}
          profile={state.adminProfile}
          onClose={() => state.setProfileEditorOpen(false)}
          onSave={async (profile) => {
            const saved = await updateAdminProfile({
              avatarUrl:
                profile.avatarUrl === state.adminProfile.avatarUrl ? undefined : profile.avatarUrl,
              name: profile.name,
            })
            state.setAdminProfile({ ...profile, ...saved, initials: getInitials(saved.name) })
            state.setProfileEditorOpen(false)
            state.showToast('Profile information updated.')
          }}
        />
      )}
      <BroadcastAnnouncementModal
        isOpen={state.broadcastModalOpen}
        onClose={() => state.setBroadcastModalOpen(false)}
        onSuccess={(msg) => state.showToast(msg)}
      />
      {state.toast && (
        <div className="toast" role="status">
          {state.toast}
        </div>
      )}
    </>
  )
}
