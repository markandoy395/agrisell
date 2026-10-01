import type { EntityRecord, ReviewAbuseFlag, ReviewModerationAction } from '../../types/dashboard'
import { Icon } from '../../components/ui/icon/Icon'
import { formatReviewDate } from './entityWorkspace.utils'

const ABUSE_FLAGS: { label: string; value: ReviewAbuseFlag }[] = [
  { label: 'Spam', value: 'spam' },
  { label: 'Harassment', value: 'harassment' },
  { label: 'Hate speech', value: 'hate_speech' },
  { label: 'Profanity', value: 'profanity' },
  { label: 'Scam', value: 'scam' },
  { label: 'Personal information', value: 'personal_information' },
  { label: 'Other', value: 'other' },
]

type ReviewModerationDialogProps = {
  error: string
  isSubmitting: boolean
  note: string
  onClose: () => void
  onNoteChange: (note: string) => void
  onSubmit: (action: ReviewModerationAction, abuseFlag?: ReviewAbuseFlag) => void
  review: EntityRecord
}

export function ReviewModerationDialog({
  error,
  isSubmitting,
  note,
  onClose,
  onNoteChange,
  onSubmit,
  review,
}: ReviewModerationDialogProps) {
  return (
    <div
      className="review-compose-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose()
      }}
    >
      <section
        className="review-compose-dialog review-moderation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-moderation-title"
      >
        <header className="review-compose-header">
          <span className="review-compose-header-icon" aria-hidden="true">
            <Icon name="shield" size={20} />
          </span>
          <div>
            <h3 id="review-moderation-title">Moderate review</h3>
            <p>Visibility, reports, abuse flags, and every admin action are persisted.</p>
          </div>
          <button
            className="review-compose-close"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close moderation dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="review-compose-content review-moderation-content">
          <div className="review-moderation-status">
            <span>
              Visibility <strong>{review.moderationVisibility ?? 'published'}</strong>
            </span>
            <span>
              Report <strong>{review.reportStatus ?? 'none'}</strong>
            </span>
          </div>
          <label className="review-moderation-note">
            <span>Moderator note (optional)</span>
            <textarea
              maxLength={500}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Add context for the audit history..."
            />
            <small>{note.length} / 500</small>
          </label>
          <div className="review-moderation-actions">
            <h4>Review visibility</h4>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() =>
                onSubmit(review.moderationVisibility === 'hidden' ? 'publish' : 'hide')
              }
            >
              {review.moderationVisibility === 'hidden' ? 'Publish review' : 'Hide / unpublish'}
            </button>
            <h4>Report resolution</h4>
            {review.reportStatus === 'open' ? (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onSubmit('resolve_report')}
                >
                  Resolve report
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onSubmit('dismiss_report')}
                >
                  Dismiss report
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onSubmit('reopen_report')}
              >
                Mark report open
              </button>
            )}
            <h4>Abuse flags</h4>
            <div className="review-flag-grid">
              {ABUSE_FLAGS.map((flag) => {
                const isApplied = review.abuseFlags?.includes(flag.value) ?? false
                return (
                  <button
                    className={isApplied ? 'is-applied' : ''}
                    type="button"
                    key={flag.value}
                    disabled={isSubmitting}
                    onClick={() =>
                      onSubmit(isApplied ? 'remove_abuse_flag' : 'add_abuse_flag', flag.value)
                    }
                  >
                    {isApplied ? 'Remove ' : 'Flag '}
                    {flag.label}
                  </button>
                )
              })}
            </div>
          </div>
          {error && (
            <p className="review-compose-error" role="alert">
              {error}
            </p>
          )}
          <div className="review-moderation-history">
            <h4>Moderation history</h4>
            {review.moderationHistory?.length ? (
              <ol>
                {review.moderationHistory.map((item, index) => (
                  <li key={`${item.eventType}-${item.createdAt}-${index}`}>
                    <strong>{item.label}</strong>
                    <span>
                      {item.actor} · {formatReviewDate(item.createdAt)}
                    </span>
                    {item.message && <p>{item.message}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No moderation actions yet.</p>
            )}
          </div>
          <div className="review-compose-actions">
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Done
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
