import { Icon } from '../../components/ui/icon/Icon'
import type { SupportFilterTab, SupportHubStats } from '../../api/adminSupportApi'

type SupportHeaderSummaryProps = {
  stats: SupportHubStats
  filter: SupportFilterTab
  autoRefresh: boolean
  isLoading: boolean
  lastUpdated: Date
  onFilterChange: (tab: SupportFilterTab) => void
  onToggleAutoRefresh: () => void
  onRefresh: () => void
  onOpenCreateTicket: () => void
}

export function SupportHeaderSummary({
  stats,
  filter,
  autoRefresh,
  isLoading,
  lastUpdated,
  onFilterChange,
  onToggleAutoRefresh,
  onRefresh,
  onOpenCreateTicket,
}: SupportHeaderSummaryProps) {
  const hasUrgent = stats.urgent > 0

  return (
    <header className="support-header-summary">
      <div className="support-title-row">
        <div>
          <div className="support-badge">CUSTOMER SERVICE & RESOLUTION DESK</div>
          <h1 id="support-center-title">Customer Support & Chat Center</h1>
          <p className="support-subtitle">
            Real-time support inbox, multi-role chat thread resolution, and in-flight delivery support messages.
          </p>
        </div>
        <div className="support-top-actions">
          <span className="support-last-updated" title={lastUpdated.toISOString()}>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
          <button
            type="button"
            className={`support-auto-refresh-btn ${autoRefresh ? 'active' : ''}`}
            onClick={onToggleAutoRefresh}
            title={autoRefresh ? 'Auto-refresh active (10s)' : 'Auto-refresh paused'}
          >
            <span
              className={`support-status-dot ${
                autoRefresh ? 'support-dot-green support-live-pulse' : 'support-dot-gray'
              }`}
            />
            {autoRefresh ? 'Live Feed' : 'Feed Paused'}
          </button>
          <button
            type="button"
            className="support-refresh-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh support hub"
          >
            <Icon name="refresh" size={16} />
            <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className="support-new-ticket-btn"
            onClick={onOpenCreateTicket}
          >
            <Icon name="plus" size={16} />
            <span>New Ticket</span>
          </button>
        </div>
      </div>

      <div className="support-metrics-grid">
        <article
          className={`support-metric-card ${filter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">TOTAL INQUIRIES</span>
          <strong className="metric-value">{stats.total}</strong>
          <small className="metric-hint">All tickets in hub</small>
        </article>

        <article
          className={`support-metric-card ${filter === 'open' ? 'active' : ''}`}
          onClick={() => onFilterChange('open')}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">OPEN & UNRESOLVED</span>
          <strong className="metric-value">{stats.open}</strong>
          <small className="metric-hint">Awaiting response</small>
        </article>

        <article
          className={`support-metric-card ${filter === 'in_progress' ? 'active' : ''}`}
          onClick={() => onFilterChange('in_progress')}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">IN PROGRESS</span>
          <strong className="metric-value">{stats.in_progress}</strong>
          <small className="metric-hint">Being handled</small>
        </article>

        <article
          className={`support-metric-card ${filter === 'resolved' ? 'active' : ''}`}
          onClick={() => onFilterChange('resolved')}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">RESOLVED</span>
          <strong className="metric-value">{stats.resolved}</strong>
          <small className="metric-hint">Completed & closed</small>
        </article>

        <article
          className={`support-metric-card urgent-metric ${hasUrgent ? 'has-urgent' : ''}`}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">URGENT PRIORITY</span>
          <strong className="metric-value">{stats.urgent}</strong>
          <small className="metric-hint">High/urgent priority</small>
        </article>

        <article
          className={`support-metric-card ${filter === 'delivery_chats' ? 'active' : ''}`}
          onClick={() => onFilterChange('delivery_chats')}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">DELIVERY CHATS</span>
          <strong className="metric-value">{stats.delivery_support_chats ?? 0}</strong>
          <small className="metric-hint">Active rider deliveries</small>
        </article>

        <article
          className={`support-metric-card ${filter === 'marketplace_chats' ? 'active' : ''}`}
          onClick={() => onFilterChange('marketplace_chats')}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">MARKETPLACE P2P</span>
          <strong className="metric-value">{stats.marketplace_chats ?? 0}</strong>
          <small className="metric-hint">Buyer ↔ Farmer chats</small>
        </article>

        <article
          className={`support-metric-card urgent-metric ${(stats.flagged_marketplace_chats ?? 0) > 0 ? 'has-urgent' : ''} ${filter === 'flagged_chats' ? 'active' : ''}`}
          onClick={() => onFilterChange('flagged_chats')}
          role="button"
          tabIndex={0}
        >
          <span className="metric-label">FLAGGED / SCAM ALERTS</span>
          <strong className="metric-value">{stats.flagged_marketplace_chats ?? 0}</strong>
          <small className="metric-hint">Audit & policy flags</small>
        </article>
      </div>
    </header>
  )
}
