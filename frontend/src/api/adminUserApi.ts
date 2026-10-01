import { ApiRequestError, requestAdminApi } from './adminAuth'

export type CreateUserInput = {
  accountType: 'user' | 'farmer'
  addressLine?: string
  barangay?: string
  bankDetails?: string
  certification?: string
  cityMunicipality?: string
  contactNumber?: string
  dateOfBirth?: string
  email: string
  eWalletDetails?: string
  extensionName?: string
  firstName: string
  gender?: string
  lastName: string
  middleName?: string
  password: string
  postalCode?: string
  province?: string
  verificationStatus?: 'pending' | 'verified'
  yearsOfExperience?: string
}

export const createAdminUser = async (input: CreateUserInput) => {
  await requestAdminApi('/api/admin/users', {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export type UpdateUserInput = Pick<
  CreateUserInput,
  | 'contactNumber'
  | 'dateOfBirth'
  | 'extensionName'
  | 'firstName'
  | 'gender'
  | 'lastName'
  | 'middleName'
> & { reason?: string }

export const updateAdminUser = async (userId: string, input: UpdateUserInput) => {
  await requestAdminApi(`/api/admin/users/${encodeURIComponent(userId)}`, {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
}

export const updateAdminUserStatus = async (
  userId: string,
  status: 'active' | 'suspended' | 'deactivated',
  reason = '',
) => {
  await requestAdminApi(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
    body: JSON.stringify({ reason, status }),
    method: 'PATCH',
  })
}

export type VerificationDocument = {
  document_id: string
  document_type: string
  document_number?: string
  expiry_date?: string
  rejection_reason?: string
  signed_url?: string
  verification_status: string
}

export type VerificationDetail = {
  actions: Array<{
    action_id: string
    action: string
    reason?: string
    message?: string
    missing_items?: string[]
    actor_email: string
    created_at: string
  }>
  documents: VerificationDocument[]
  profile: Record<string, unknown>
}

export const getVerificationDetail = async (entityType: 'farmer' | 'rider', entityId: string) =>
  requestAdminApi(
    `/api/admin/verifications/${entityType}/${encodeURIComponent(entityId)}`,
  ) as Promise<VerificationDetail>

export type VerificationReviewInput = {
  action:
    | 'profile_updated'
    | 'verified'
    | 'rejected'
    | 'needs_information'
    | 'suspended'
    | 'deactivated'
    | 'reactivated'
  reason?: string
  message?: string
  missingItems?: string[]
  documentDecisions?: Array<{
    documentId: string
    status: 'verified' | 'rejected'
    reason?: string
  }>
  profileUpdates?: Record<string, string>
}

export const reviewVerification = async (
  entityType: 'farmer' | 'rider',
  entityId: string,
  input: VerificationReviewInput,
) => {
  await requestAdminApi(`/api/admin/verifications/${entityType}/${encodeURIComponent(entityId)}`, {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
}

export const approveFarmerProfile = async (farmerId: string) => {
  if (!farmerId) throw new ApiRequestError('A farmer ID is required for approval.', 400)
  await requestAdminApi(`/api/admin/farmers/${encodeURIComponent(farmerId)}/approval`, {
    method: 'PATCH',
  })
}

export const approveRiderProfile = async (riderId: string) => {
  if (!riderId) throw new ApiRequestError('A rider ID is required for approval.', 400)
  await requestAdminApi(`/api/admin/riders/${encodeURIComponent(riderId)}/approval`, {
    method: 'PATCH',
  })
}

export const requestFarmerInformation = async (farmerId: string) => {
  if (!farmerId) throw new ApiRequestError('A farmer ID is required.', 400)
  await requestAdminApi(`/api/admin/farmers/${encodeURIComponent(farmerId)}/information-requests`, {
    method: 'POST',
  })
}
