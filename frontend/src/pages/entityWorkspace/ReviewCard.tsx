import type { EntityRecord } from '../../types/dashboard'
import { Icon } from '../../components/ui/icon/Icon'
import type { ReviewCardModel } from './entityWorkspace.types'
import { formatReviewDate } from './entityWorkspace.utils'
import { ReviewStars } from './ReviewStars'

type ReviewCardProps = {
  review: ReviewCardModel
  onCompose: (mode: 'public' | 'direct', record: EntityRecord) => void
  onModerate: (record: EntityRecord) => void
}

export function ReviewCard({ review, onCompose, onModerate }: ReviewCardProps) {
  const record = review.record
  return (
    <article
      className="review-card"
      key={record.entityId ?? `${record.primary}-${record.secondary}`}
    >
      <div className={`review-avatar review-avatar-${review.avatarTone}`} aria-hidden="true">
        {review.initials}
      </div>
      <div className="review-author">
        <h3>{record.primary}</h3>
        <span>
          Reviewed {record.reviewedType?.toLowerCase() ?? 'account'}:{' '}
          {record.reviewedName ?? 'Not recorded'}
        </span>
        <span>{record.referenceLabel ?? record.category}</span>
      </div>
      <div className="review-body">
        <div className="review-card-meta">
          <span className="review-stars">
            <ReviewStars rating={review.rating} size={14} />
            <span className="review-sr-only">{review.rating} out of 5 stars</span>
          </span>
          <time>{review.date}</time>
          <span className={`status ${record.tone}`}>
            <i aria-hidden="true" />
            {record.status}
          </span>
        </div>
        <p>{review.comment}</p>
        {record.adminResponse && (
          <p className="review-admin-response">
            <strong>
              {record.adminResponseMode === 'direct' ? 'Private response' : 'Admin response'}:
            </strong>{' '}
            {record.adminResponse}
          </p>
        )}
        {!!record.abuseFlags?.length && (
          <div className="review-abuse-flags" aria-label="Abuse flags">
            {record.abuseFlags.map((flag) => (
              <span key={flag}>{flag.replaceAll('_', ' ')}</span>
            ))}
          </div>
        )}
        {!!record.moderationHistory?.length && (
          <details className="review-history" open>
            <summary>Moderation history ({record.moderationHistory.length})</summary>
            <ol>
              {record.moderationHistory.map((item, index) => (
                <li key={`${item.eventType}-${item.createdAt}-${index}`}>
                  <strong>{item.label}</strong>
                  <span>
                    {item.actor} · {formatReviewDate(item.createdAt)}
                  </span>
                  {item.message && <p>{item.message}</p>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <div className="review-card-actions">
        <button
          className="review-action-button review-action-button--primary"
          type="button"
          onClick={() => onCompose('public', record)}
        >
          <Icon name="message" size={15} /> Public Comment
        </button>
        <button
          className="review-action-button"
          type="button"
          onClick={() => onCompose('direct', record)}
        >
          <Icon name="mail" size={15} /> Direct Message
        </button>
        <button
          className="review-action-button review-moderate-button"
          type="button"
          onClick={() => onModerate(record)}
        >
          <Icon name="shield" size={16} /> Moderate
        </button>
      </div>
    </article>
  )
}
