import type { EntityRecord } from '../../types/dashboard'
import { Icon } from '../../components/ui/icon/Icon'
import type { EntityWorkspaceProps } from './entityWorkspace.types'
import { createReviewCards, REVIEWS_PER_PAGE } from './entityWorkspace.utils'
import { ReviewCard } from './ReviewCard'
import { ReviewComposer } from './ReviewComposer'
import { ReviewModerationDialog } from './ReviewModerationDialog'
import { ReviewSummary } from './ReviewSummary'
import { useReviewWorkspace } from './useReviewWorkspace'

type ReviewWorkspaceProps = Pick<
  EntityWorkspaceProps,
  'activeOnly' | 'onReviewModeration' | 'onReviewResponse' | 'onToggleFilter'
> & {
  averageRating: string
  description: string
  period: string
  records: EntityRecord[]
  visibleRecords: EntityRecord[]
}

export function ReviewWorkspace({
  activeOnly,
  averageRating,
  description,
  onReviewModeration,
  onReviewResponse,
  onToggleFilter,
  period,
  records,
  visibleRecords,
}: ReviewWorkspaceProps) {
  const reviewCards = createReviewCards(visibleRecords)
  const state = useReviewWorkspace(reviewCards, { onReviewModeration, onReviewResponse })
  return (
    <section className="review-workspace panel module-reviews" aria-labelledby="reviews-title">
      <div className="review-heading">
        <div className="review-heading-main">
          <span className="review-heading-icon" aria-hidden="true">
            <Icon name="message" size={30} />
          </span>
          <div>
            <h2 id="reviews-title">Customer Feedback</h2>
            <strong>Reviews</strong>
            <p>{description}</p>
          </div>
        </div>
        <div className="review-period" aria-label={`Review period ${period}`}>
          <Icon name="calendar" size={16} /> {period} <Icon name="chevron" size={14} />
        </div>
      </div>
      <ReviewSummary averageRating={averageRating} records={records} />
      <div className="review-toolbar dashboard-filter-grid">
        <div>
          <strong>{reviewCards.length} reviews shown</strong>
          <span>Latest reviews from farmers and riders.</span>
        </div>
        <label className="dashboard-filter-field">
          <span>Status</span>
          <select value={activeOnly ? 'published' : 'all'} onChange={onToggleFilter}>
            <option value="all">All reviews</option>
            <option value="published">Published only</option>
          </select>
        </label>
      </div>
      <div className="review-list">
        {state.pageCards.map((review) => (
          <ReviewCard
            key={review.record.entityId ?? `${review.record.primary}-${review.record.secondary}`}
            review={review}
            onCompose={state.openComposer}
            onModerate={state.openModeration}
          />
        ))}
        {reviewCards.length === 0 && <div className="no-orders">No matching reviews found.</div>}
      </div>
      {reviewCards.length > 0 && (
        <div className="review-pagination-footer">
          <span>
            Showing {(state.activePage - 1) * REVIEWS_PER_PAGE + 1} to{' '}
            {Math.min(state.activePage * REVIEWS_PER_PAGE, reviewCards.length)} of{' '}
            {reviewCards.length} reviews
          </span>
          <nav className="review-pagination" aria-label="Review pages">
            <button
              type="button"
              disabled={state.activePage === 1}
              onClick={() => state.setReviewPage((page) => Math.max(1, page - 1))}
              aria-label="Previous review page"
            >
              <Icon name="chevron" size={15} />
            </button>
            {Array.from({ length: state.totalPages }, (_, index) => index + 1).map((page) => (
              <button
                className={state.activePage === page ? 'is-active' : ''}
                type="button"
                key={page}
                onClick={() => state.setReviewPage(page)}
                aria-current={state.activePage === page ? 'page' : undefined}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={state.activePage === state.totalPages}
              onClick={() => state.setReviewPage((page) => Math.min(state.totalPages, page + 1))}
              aria-label="Next review page"
            >
              <Icon name="chevron" size={15} />
            </button>
          </nav>
        </div>
      )}
      {state.composer && (
        <ReviewComposer
          composer={state.composer}
          error={state.responseError}
          isSubmitting={state.isResponseSubmitting}
          message={state.message}
          onClose={state.closeComposer}
          onMessageChange={state.setMessage}
          onSubmit={(event) => void state.submitResponse(event)}
        />
      )}
      {state.moderationReview && (
        <ReviewModerationDialog
          error={state.moderationError}
          isSubmitting={state.isModerationSubmitting}
          note={state.moderationNote}
          onClose={state.closeModeration}
          onNoteChange={state.setModerationNote}
          onSubmit={(action, flag) => void state.submitModeration(action, flag)}
          review={state.moderationReview}
        />
      )}
    </section>
  )
}
