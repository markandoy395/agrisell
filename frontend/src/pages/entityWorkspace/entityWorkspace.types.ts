import type { EntityRecord, ReviewAbuseFlag, ReviewModerationAction } from '../../types/dashboard'
import type { LocationPin } from '../../types/location'

export type EntityWorkspaceProps = {
  locationPins?: LocationPin[]
  records?: EntityRecord[]
  section: string
  search: string
  created: EntityRecord[]
  activeOnly: boolean
  period?: string
  onToggleFilter: () => void
  onAdd: () => void
  onOpen: (record: EntityRecord) => void
  onReviewResponse?: (
    mode: 'public' | 'direct',
    review: EntityRecord,
    message: string,
  ) => Promise<void>
  onReviewModeration?: (
    action: ReviewModerationAction,
    review: EntityRecord,
    options?: { abuseFlag?: ReviewAbuseFlag; note?: string },
  ) => Promise<void>
}

export type ReviewCardModel = {
  avatarTone: 'orange' | 'gold' | 'green'
  comment: string
  date: string
  initials: string
  rating: number
  record: EntityRecord
}
