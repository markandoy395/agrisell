import type { EntityRecord } from '../../types/dashboard'
import type { ModuleHighlight } from '../../types/dashboard'
import type { ReviewCardModel } from './entityWorkspace.types'

export const REVIEWS_PER_PAGE = 4

export const ACTIVE_RECORD_STATUSES = new Set([
  'Active',
  'Available',
  'Verified',
  'Completed',
  'Published',
  'Replied',
  'Messaged',
  'Delivered',
  'In cart',
  'To deliver',
  'In transit',
  'Processing',
  'Paid',
  'On delivery',
])

export const getLiveHighlights = (section: string, records: EntityRecord[]): ModuleHighlight[] => {
  if (section === 'Reviews') {
    const ratings = records
      .map((record) => record.rating ?? Number(record.value.match(/[\d.]+/)?.[0]))
      .filter((rating) => Number.isFinite(rating))
    const average =
      ratings.length === 0
        ? '0.0'
        : (ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1)
    return [
      {
        detail: 'Submitted database reviews',
        label: 'Total reviews',
        value: String(records.length),
      },
      { detail: 'Average customer rating', label: 'Average rating', value: average },
      {
        detail: 'Reviews that need attention',
        label: 'Needs reply',
        value: String(records.filter((record) => /pending|review/i.test(record.status)).length),
      },
    ]
  }
  const activeRecords = records.filter((record) => ACTIVE_RECORD_STATUSES.has(record.status)).length
  return [
    { detail: 'Current database records', label: 'Total records', value: String(records.length) },
    {
      detail: 'Available, active, or completed',
      label: 'Active records',
      value: String(activeRecords),
    },
    {
      detail: 'Pending or inactive records',
      label: 'Need attention',
      value: String(records.length - activeRecords),
    },
  ]
}

export const getModuleClassName = (section: string) =>
  `module-${section.toLowerCase().replace(/\s+/g, '-')}`

export const getReviewInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const getReviewRating = (record: EntityRecord) => {
  const rating = record.rating ?? Number(record.value.match(/\d+(?:\.\d+)?/)?.[0] ?? 0)
  return Math.min(5, Math.max(0, Math.round(rating)))
}

export const formatReviewDate = (value?: string) => {
  if (!value) return 'Date not recorded'
  const reviewDate = new Date(value)
  return Number.isNaN(reviewDate.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PH', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(reviewDate)
}

export const getReviewDistribution = (records: EntityRecord[]) => {
  const ratings = records.map(getReviewRating).filter((rating) => rating >= 1)
  return [5, 4, 3, 2, 1].map((rating) => {
    const count = ratings.filter((recordRating) => recordRating === rating).length
    return {
      count,
      percent: ratings.length === 0 ? 0 : Math.round((count / ratings.length) * 100),
      rating,
    }
  })
}

export const createReviewCards = (records: EntityRecord[]): ReviewCardModel[] =>
  records.map((record) => ({
    avatarTone:
      getReviewRating(record) <= 2 ? 'orange' : record.reviewedType === 'Rider' ? 'gold' : 'green',
    comment: record.comment ?? record.secondary,
    date: formatReviewDate(record.reviewDate),
    initials: getReviewInitials(record.primary),
    rating: getReviewRating(record),
    record,
  }))
