import type { FormEvent } from 'react'
import type { EntityRecord } from '../../types/dashboard'
import { Icon } from '../../components/ui/icon/Icon'
import { formatReviewDate, getReviewInitials, getReviewRating } from './entityWorkspace.utils'
import { ReviewStars } from './ReviewStars'

export type ReviewComposerState = {
  mode: 'public' | 'direct'
  review: EntityRecord
}

type ReviewComposerProps = {
  composer: ReviewComposerState
  error: string
  isSubmitting: boolean
  message: string
  onClose: () => void
  onMessageChange: (message: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ReviewComposer({
  composer,
  error,
  isSubmitting,
  message,
  onClose,
  onMessageChange,
  onSubmit,
}: ReviewComposerProps) {
  const review = composer.review
  const isPublic = composer.mode === 'public'
  return (
    <div
      className="review-compose-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={`review-compose-dialog review-compose-dialog--${composer.mode}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-compose-title"
      >
        <header className="review-compose-header">
          <span className="review-compose-header-icon" aria-hidden="true">
            <Icon name={isPublic ? 'message' : 'mail'} size={20} />
          </span>
          <div>
            <h3 id="review-compose-title">{isPublic ? 'Public Comment' : 'Direct Message'}</h3>
            <p>
              {isPublic
                ? 'This comment will be visible to everyone.'
                : 'This message will be sent privately to the reviewer.'}
            </p>
          </div>
          <button
            className="review-compose-close"
            type="button"
            onClick={onClose}
            aria-label="Close message composer"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="review-compose-content">
          <div className="review-compose-review">
            <span
              className={`review-avatar ${review.reviewedType === 'Rider' ? 'review-avatar-gold' : ''}`}
              aria-hidden="true"
            >
              {getReviewInitials(review.primary)}
            </span>
            <div className="review-compose-author">
              <h4>{review.primary}</h4>
              <span>
                Reviewed {review.reviewedType?.toLowerCase() ?? 'account'}:{' '}
                {review.reviewedName ?? 'Not recorded'}
              </span>
              <strong>{review.referenceLabel ?? review.category}</strong>
            </div>
            <div className="review-compose-meta">
              <span className="review-stars">
                <ReviewStars rating={getReviewRating(review)} size={14} />
              </span>
              <time>{formatReviewDate(review.reviewDate)}</time>
              <span className={`status ${review.tone}`}>
                <i aria-hidden="true" /> {review.status}
              </span>
            </div>
            <p>{review.comment ?? review.secondary}</p>
          </div>
          {!isPublic && (
            <div className="review-private-notice">
              <Icon name="lock" size={16} />
              <div>
                <strong>This is a private conversation between you and the reviewer.</strong>
                <span>Messages here will not be visible to other users.</span>
              </div>
            </div>
          )}
          <form className="review-compose-form" onSubmit={onSubmit}>
            <label>
              <span className="review-sr-only">
                {isPublic ? 'Public comment' : 'Direct message'}
              </span>
              <textarea
                autoFocus
                maxLength={isPublic ? 500 : 1000}
                placeholder={isPublic ? 'Write your public comment...' : 'Write your message...'}
                value={message}
                onChange={(event) => onMessageChange(event.target.value)}
              />
              <small>
                {message.length} / {isPublic ? 500 : 1000}
              </small>
            </label>
            {error && (
              <p className="review-compose-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              {isPublic && (
                <span className="review-public-notice">
                  <Icon name="grid" size={14} /> Your comment will be visible to all users.
                </span>
              )}
              <div className="review-compose-actions">
                <button type="button" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </button>
                <button
                  className="review-compose-submit"
                  type="submit"
                  disabled={!message.trim() || isSubmitting}
                >
                  <Icon name="arrow" size={15} />
                  {isSubmitting ? 'Sending...' : isPublic ? 'Post Comment' : 'Send Message'}
                </button>
              </div>
            </footer>
          </form>
        </div>
      </section>
    </div>
  )
}
