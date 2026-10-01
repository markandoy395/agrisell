import type { ReviewAbuseFlag, ReviewModerationAction } from '../types/entityWorkspace'
import { ApiRequestError, requestAdminApi } from './adminAuth'

export const respondToReview = async (
  reviewType: 'farmer' | 'rider',
  reviewId: string,
  mode: 'public' | 'direct',
  message: string,
) => {
  if (!reviewId) throw new ApiRequestError('A review ID is required.', 400)
  await requestAdminApi(
    `/api/admin/reviews/${reviewType}/${encodeURIComponent(reviewId)}/responses`,
    { body: JSON.stringify({ message, mode }), method: 'POST' },
  )
}

export const moderateReview = async (
  reviewType: 'farmer' | 'rider',
  reviewId: string,
  action: ReviewModerationAction,
  options: { abuseFlag?: ReviewAbuseFlag; note?: string } = {},
) => {
  if (!reviewId) throw new ApiRequestError('A review ID is required.', 400)
  await requestAdminApi(
    `/api/admin/reviews/${reviewType}/${encodeURIComponent(reviewId)}/moderation`,
    { body: JSON.stringify({ action, ...options }), method: 'POST' },
  )
}
