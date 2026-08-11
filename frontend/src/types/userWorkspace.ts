import type { IconName } from './icon'

export type UserAccountStatus = 'Active' | 'Inactive'

export type UserDateFilter = 'All' | 'Recent'

export type UserStatusFilter = 'All status' | UserAccountStatus

export type UserType = 'Buyer' | 'Farmer' | 'Admin' | 'Rider' | 'User'

export type UserWorkspaceSummaryCard = {
  label: string
  value: string
  detail: string
  trend: string
  icon: IconName
}

export type UserWorkspaceRow = {
  userId: string
  firstName: string
  middleName: string
  lastName: string
  extensionName: string
  email: string
  contactNumber: string
  profilePhotoUrl?: string
  accountStatus: UserAccountStatus
  createdAt: string
  updatedAt: string
  gender: string
  dateOfBirth: string
  eWalletDetails: string
  buyerUserId?: string
  shippingAddress?: string
  loyaltyPoints?: number
  preferredPaymentMethod?: string
  gpsLat?: number
  gpsLong?: number
  userType: UserType
  businessName?: string
}
