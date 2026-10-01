import type { EntityRecord } from '../../types/dashboard'
import { WorkspaceStatsGrid } from '../../components/ui/workspaceStats/WorkspaceStatsGrid'
import { getReviewDistribution } from './entityWorkspace.utils'

type ReviewSummaryProps = {
  averageRating: string
  records: EntityRecord[]
}

export function ReviewSummary({ averageRating, records }: ReviewSummaryProps) {
  const farmerCount = records.filter((record) => record.reviewedType === 'Farmer').length
  const riderCount = records.filter((record) => record.reviewedType === 'Rider').length
  return (
    <div className="review-overview" aria-label="Review summary">
      <WorkspaceStatsGrid
        ariaLabel="Review metrics"
        cards={[
          {
            detail: `${farmerCount} Farmer reviews · ${riderCount} Rider reviews`,
            icon: 'message',
            label: 'Total reviews',
            trend: 'Live',
            value: records.length,
          },
          {
            detail: 'Average across all database reviews',
            icon: 'star',
            label: 'Average rating',
            trend: 'Live',
            value: averageRating,
          },
        ]}
      />
      <article className="review-distribution">
        <h3>Rating Breakdown</h3>
        {getReviewDistribution(records).map((item) => (
          <div className="review-rating-row" key={item.rating}>
            <span>{item.rating}</span>
            <div className="review-rating-track">
              <i style={{ width: `${item.percent}%` }} />
            </div>
            <strong>{item.count}</strong>
          </div>
        ))}
      </article>
    </div>
  )
}
