import type { IconName } from '../../../types/icon'
import { Icon } from '../icon/Icon'
import './WorkspaceStatsGrid.css'

export type WorkspaceStat = {
  accent?: 'dark' | 'green' | 'lime' | 'soft'
  detail: string
  icon: IconName
  label: string
  onClick?: () => void
  trend?: string
  value: number | string
}

type WorkspaceStatsGridProps = {
  ariaLabel: string
  cards: WorkspaceStat[]
}

function StatCardContent({ detail, icon, label, trend = 'Live', value }: WorkspaceStat) {
  return (
    <>
      <span className="workspace-stat-top">
        <span className="workspace-stat-icon" aria-hidden="true">
          <Icon name={icon} size={15} />
        </span>
        <span className="workspace-stat-label">{label}</span>
        <span className="workspace-stat-menu" aria-hidden="true">
          <Icon name="more" size={16} />
        </span>
      </span>
      <span className="workspace-stat-value-row">
        <strong>{value}</strong>
        <span className="workspace-stat-growth">
          {trend}
          <Icon name="trend" size={11} />
        </span>
      </span>
      <small>{detail}</small>
    </>
  )
}

export function WorkspaceStatsGrid({ ariaLabel, cards }: WorkspaceStatsGridProps) {
  return (
    <div className="workspace-stats-grid" aria-label={ariaLabel}>
      {cards.map((card) =>
        card.onClick ? (
          <button
            className={`workspace-stat-card workspace-stat-card--clickable${card.accent ? ` workspace-stat-card--accent-${card.accent}` : ''}`}
            key={card.label}
            type="button"
            onClick={card.onClick}
          >
            <StatCardContent {...card} />
          </button>
        ) : (
          <article
            className={`workspace-stat-card${card.accent ? ` workspace-stat-card--accent-${card.accent}` : ''}`}
            key={card.label}
          >
            <StatCardContent {...card} />
          </article>
        ),
      )}
    </div>
  )
}
