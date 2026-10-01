import type { AdministratorRecord } from '../types/adminData'
import type { EntityRecord, FarmerFarm, UserWorkspaceRow } from '../types/dashboard'
import type { ReviewAbuseFlag, ReviewModerationHistoryItem } from '../types/entityWorkspace'
import { getArray, getNumber, getString, getStringArray, isRecord } from './adminDataValue'

export const parseEntityRecord = (value: unknown): EntityRecord => {
  const row = isRecord(value) ? value : {}
  const gpsLat = getNumber(row.gpsLat, Number.NaN)
  const gpsLong = getNumber(row.gpsLong, Number.NaN)
  const reviewedType = getString(row.reviewedType)
  const reportStatus = getString(row.reportStatus)
  return {
    abuseFlags: getStringArray(row.abuseFlags).filter((flag): flag is ReviewAbuseFlag =>
      [
        'spam',
        'harassment',
        'hate_speech',
        'profanity',
        'scam',
        'personal_information',
        'other',
      ].includes(flag),
    ),
    adminResponse: getString(row.adminResponse) || undefined,
    adminResponseMode:
      getString(row.adminResponseMode) === 'direct'
        ? 'direct'
        : getString(row.adminResponseMode) === 'public'
          ? 'public'
          : undefined,
    approvalStatus: getString(row.approvalStatus) || undefined,
    approvalTone: getString(row.approvalTone) || undefined,
    category: getString(row.category, 'Not set'),
    comment: getString(row.comment) || undefined,
    entityId: getString(row.entityId) || undefined,
    moderationHistory: getArray(row.moderationHistory)
      .filter(isRecord)
      .map((item): ReviewModerationHistoryItem => ({
        actor: getString(item.actor, 'Administrator'),
        createdAt: getString(item.createdAt),
        eventType: getString(item.eventType, 'moderation_updated'),
        label: getString(item.label, 'Moderation updated'),
        message: getString(item.message) || undefined,
      })),
    moderationVisibility: getString(row.moderationVisibility) === 'hidden' ? 'hidden' : 'published',
    gpsLat: Number.isFinite(gpsLat) ? gpsLat : undefined,
    gpsLong: Number.isFinite(gpsLong) ? gpsLong : undefined,
    primary: getString(row.primary, 'Unnamed record'),
    rating: Number.isFinite(getNumber(row.rating, Number.NaN)) ? getNumber(row.rating) : undefined,
    referenceLabel: getString(row.referenceLabel) || undefined,
    reviewDate: getString(row.reviewDate) || undefined,
    reviewedName: getString(row.reviewedName) || undefined,
    reviewedType: reviewedType === 'Farmer' || reviewedType === 'Rider' ? reviewedType : undefined,
    reportStatus: ['open', 'resolved', 'dismissed'].includes(reportStatus)
      ? (reportStatus as 'open' | 'resolved' | 'dismissed')
      : 'none',
    secondary: getString(row.secondary, 'Not recorded'),
    status: getString(row.status, 'Pending'),
    tone: getString(row.tone, 'blue'),
    value: getString(row.value, 'Not set'),
  }
}

export const parseUser = (value: unknown): UserWorkspaceRow => {
  const row = isRecord(value) ? value : {}
  const userType = getString(row.userType)
  const accountStatus = getString(row.accountStatus)
  const gpsLat = getNumber(row.gpsLat, Number.NaN)
  const gpsLong = getNumber(row.gpsLong, Number.NaN)
  const loyaltyPoints = getNumber(row.loyaltyPoints, Number.NaN)
  return {
    accountStatus: ['Pending', 'Suspended', 'Deactivated', 'Rejected'].includes(accountStatus)
      ? (accountStatus as UserWorkspaceRow['accountStatus'])
      : 'Active',
    businessName: getString(row.businessName) || undefined,
    buyerUserId: getString(row.buyerUserId) || undefined,
    contactNumber: getString(row.contactNumber, 'Not provided'),
    createdAt: getString(row.createdAt, 'Not recorded'),
    dateOfBirth: getString(row.dateOfBirth, 'Not recorded'),
    eWalletDetails: getString(row.eWalletDetails, 'Not linked'),
    email: getString(row.email, 'Not provided'),
    extensionName: getString(row.extensionName),
    firstName: getString(row.firstName),
    gender: getString(row.gender, 'Not specified'),
    gpsLat: Number.isFinite(gpsLat) ? gpsLat : undefined,
    gpsLong: Number.isFinite(gpsLong) ? gpsLong : undefined,
    lastName: getString(row.lastName),
    loyaltyPoints: Number.isFinite(loyaltyPoints) ? loyaltyPoints : undefined,
    middleName: getString(row.middleName),
    preferredPaymentMethod: getString(row.preferredPaymentMethod) || undefined,
    profilePhotoUrl: getString(row.profilePhotoUrl) || undefined,
    shippingAddress: getString(row.shippingAddress) || undefined,
    updatedAt: getString(row.updatedAt, 'Not recorded'),
    userId: getString(row.userId, 'USR-record'),
    userType: ['Admin', 'Buyer', 'Farmer', 'Rider'].includes(userType)
      ? (userType as UserWorkspaceRow['userType'])
      : 'User',
  }
}

export const parseFarmerFarm = (value: unknown): FarmerFarm => {
  const row = isRecord(value) ? value : {}
  return {
    certifications: getStringArray(row.certifications),
    commodities: getStringArray(row.commodities),
    farmImages: getArray(row.farmImages)
      .filter(isRecord)
      .map((image, index) => ({
        alt: getString(image.alt, `Farm image ${index + 1}`),
        imageUrl: getString(image.imageUrl),
        title: getString(image.title, `Farm image ${index + 1}`),
      }))
      .filter((image) => image.imageUrl.length > 0),
    farmLocation: getString(row.farmLocation, 'Location not set'),
    farmName: getString(row.farmName, 'Unnamed farm'),
    farmSizeHectares: getNumber(row.farmSizeHectares),
    farmingType: getString(row.farmingType, 'Not specified'),
    farmerId: getString(row.farmerId),
    gpsLat: getNumber(row.gpsLat),
    gpsLong: getNumber(row.gpsLong),
    id: getString(row.id),
    irrigationType: getString(row.irrigationType, 'Not specified'),
    mainCrops: getStringArray(row.mainCrops),
    soilType: getString(row.soilType, 'Not specified'),
    status: getString(row.status, 'Pending'),
    tone: getString(row.tone, 'blue'),
    totalCrops: getNumber(row.totalCrops),
  }
}

export const parseEntityRows = (value: unknown) => {
  if (!isRecord(value)) return {}
  return Object.entries(value).reduce<Record<string, EntityRecord[]>>(
    (rows, [section, sectionRows]) => {
      rows[section] = getArray(sectionRows).map(parseEntityRecord)
      return rows
    },
    {},
  )
}

export const parseAdministrator = (value: unknown): AdministratorRecord | null => {
  if (!isRecord(value)) return null
  const role = getString(value.role)
  const userId = getString(value.userId)
  if ((role !== 'admin' && role !== 'super_admin') || !userId) return null
  return {
    email: getString(value.email, 'Email not recorded'),
    enabled: value.enabled !== false,
    name: getString(value.name, `Admin ${userId}`),
    permissions: getStringArray(value.permissions),
    role,
    userId,
  }
}
