import { useState, type FormEvent } from 'react'
import type { EntityRecord, ReviewAbuseFlag, ReviewModerationAction } from '../../types/dashboard'
import type { ReviewCardModel } from './entityWorkspace.types'
import { REVIEWS_PER_PAGE } from './entityWorkspace.utils'
import type { ReviewComposerState } from './ReviewComposer'

type ReviewActions = {
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

export function useReviewWorkspace(cards: ReviewCardModel[], actions: ReviewActions) {
  const [reviewPage, setReviewPage] = useState(1)
  const [composer, setComposer] = useState<ReviewComposerState | null>(null)
  const [message, setMessage] = useState('')
  const [responseError, setResponseError] = useState('')
  const [isResponseSubmitting, setIsResponseSubmitting] = useState(false)
  const [moderationReview, setModerationReview] = useState<EntityRecord | null>(null)
  const [moderationNote, setModerationNote] = useState('')
  const [moderationError, setModerationError] = useState('')
  const [isModerationSubmitting, setIsModerationSubmitting] = useState(false)
  const totalPages = Math.max(1, Math.ceil(cards.length / REVIEWS_PER_PAGE))
  const activePage = Math.min(reviewPage, totalPages)
  const pageCards = cards.slice((activePage - 1) * REVIEWS_PER_PAGE, activePage * REVIEWS_PER_PAGE)

  const closeComposer = () => {
    setComposer(null)
    setMessage('')
    setResponseError('')
  }
  const openComposer = (mode: 'public' | 'direct', review: EntityRecord) => {
    setMessage('')
    setResponseError('')
    setComposer({ mode, review })
  }
  const submitResponse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const responseMessage = message.trim()
    if (!responseMessage || !composer || !actions.onReviewResponse) return
    setResponseError('')
    setIsResponseSubmitting(true)
    try {
      await actions.onReviewResponse(composer.mode, composer.review, responseMessage)
      closeComposer()
    } catch (error) {
      setResponseError(error instanceof Error ? error.message : 'The response could not be sent.')
    } finally {
      setIsResponseSubmitting(false)
    }
  }
  const closeModeration = () => {
    setModerationReview(null)
    setModerationNote('')
    setModerationError('')
  }
  const openModeration = (review: EntityRecord) => {
    setModerationNote('')
    setModerationError('')
    setModerationReview(review)
  }
  const submitModeration = async (action: ReviewModerationAction, abuseFlag?: ReviewAbuseFlag) => {
    if (!moderationReview || !actions.onReviewModeration) return
    setModerationError('')
    setIsModerationSubmitting(true)
    try {
      await actions.onReviewModeration(action, moderationReview, {
        ...(abuseFlag ? { abuseFlag } : {}),
        ...(moderationNote.trim() ? { note: moderationNote.trim() } : {}),
      })
      setModerationNote('')
    } catch (error) {
      setModerationError(
        error instanceof Error ? error.message : 'The moderation change could not be saved.',
      )
    } finally {
      setIsModerationSubmitting(false)
    }
  }

  const activeModerationReview = moderationReview
    ? cards.find(
        (card) =>
          (card.record.entityId ?? `${card.record.primary}-${card.record.secondary}`) ===
          (moderationReview.entityId ?? `${moderationReview.primary}-${moderationReview.secondary}`),
      )?.record ?? moderationReview
    : null

  return {
    activePage,
    closeComposer,
    closeModeration,
    composer,
    isModerationSubmitting,
    isResponseSubmitting,
    message,
    moderationError,
    moderationNote,
    moderationReview: activeModerationReview,
    openComposer,
    openModeration,
    pageCards,
    responseError,
    setMessage,
    setModerationNote,
    setReviewPage,
    submitModeration,
    submitResponse,
    totalPages,
  }
}
