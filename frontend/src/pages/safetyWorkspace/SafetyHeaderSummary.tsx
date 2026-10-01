import { Icon } from '../../components/ui/icon/Icon'
import type { SafetyFilterTab, SafetyIncidentSummary } from './safetyWorkspace.types'

type SafetyHeaderSummaryProps = {
  summary: SafetyIncidentSummary
  filter: SafetyFilterTab
  search: string
  onFilterChange: (tab: SafetyFilterTab) => void
  onSearchChange: (value: string) => void
}

export function SafetyHeaderSummary({
  summary,
  filter,
  search,
  onFilterChange,
  onSearchChange,
}: SafetyHeaderSummaryProps) {
  const hasEmergency = summary.open_emergencies > 0

  return (
    <div className="safety-header-summary">
      {/* 1. Flashing Emergency SOS Alert Banner */}
      {hasEmergency && (
        <aside className="emergency-alert-banner" role="alert">
          <div className="emergency-alert-left">
            <div className="emergency-alert-icon">
              <Icon name="siren" size={22} />
            </div>
            <div className="emergency-alert-content">
              <strong>CRITICAL SAFETY ALERT</strong>
              <span>
                {summary.open_emergencies} active rider Emergency SOS call(s) require immediate
                response and live location tracking!
              </span>
            </div>
          </div>
          <button
            type="button"
            className="emergency-alert-action"
            onClick={() => onFilterChange('emergency')}
          >
            <span>View Emergencies ({summary.open_emergencies})</span>
            <Icon name="chevronRight" size={16} />
          </button>
        </aside>
      )}

      {/* Metric Summary Cards */}
      <div className="safety-metrics-grid">
        <article
          className="safety-metric-card total-metric"
          onClick={() => onFilterChange('all')}
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-icon-circle icon-total">
            <Icon name="document" size={20} />
          </div>
          <div className="metric-info-col">
            <span className="metric-label">TOTAL REPORTS</span>
            <strong className="metric-value">{summary.total_incidents}</strong>
            <small className="metric-hint">All logged safety reports</small>
          </div>
        </article>

        <article
          className={`safety-metric-card emergency-metric ${hasEmergency ? 'has-active-sos' : ''}`}
          onClick={() => onFilterChange('emergency')}
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-icon-circle icon-emergency">
            <Icon name="siren" size={20} />
          </div>
          <div className="metric-info-col">
            <div className="metric-header-row">
              <span className="metric-label text-danger">EMERGENCY SOS</span>
            </div>
            <div className="metric-value-row">
              <strong className="metric-value text-danger">{summary.open_emergencies}</strong>
              {hasEmergency && <span className="action-needed-badge">ACTION NEEDED</span>}
            </div>
            <small className="metric-hint">Active SOS & urgent distress</small>
          </div>
        </article>

        <article
          className="safety-metric-card accident-metric"
          onClick={() => onFilterChange('accidents')}
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-icon-circle icon-accident">
            <Icon name="warning" size={20} />
          </div>
          <div className="metric-info-col">
            <span className="metric-label">ACCIDENTS & HAZARDS</span>
            <strong className="metric-value">{summary.active_accidents}</strong>
            <small className="metric-hint">Crashes, theft, or threats</small>
          </div>
        </article>

        <article
          className="safety-metric-card review-metric"
          onClick={() => onFilterChange('underReview')}
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-icon-circle icon-review">
            <Icon name="search" size={20} />
          </div>
          <div className="metric-info-col">
            <span className="metric-label">UNDER INVESTIGATION</span>
            <strong className="metric-value">{summary.under_review}</strong>
            <small className="metric-hint">Being handled by dispatch</small>
          </div>
        </article>

        <article
          className="safety-metric-card resolved-metric"
          onClick={() => onFilterChange('resolved')}
          style={{ cursor: 'pointer' }}
        >
          <div className="metric-icon-circle icon-resolved">
            <Icon name="checkCircle" size={20} />
          </div>
          <div className="metric-info-col">
            <span className="metric-label">RESOLVED</span>
            <strong className="metric-value">{summary.resolved}</strong>
            <small className="metric-hint">Closed with resolution notes</small>
          </div>
        </article>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="safety-controls-bar dashboard-filter-grid">
        <label className="dashboard-filter-field">
          <span>Search</span>
          <span className="safety-search-box dashboard-filter-control">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Rider, report ID..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </span>
        </label>
        <label className="dashboard-filter-field">
          <span>Incident type</span>
          <select
            value={filter}
            onChange={(event) => onFilterChange(event.target.value as SafetyFilterTab)}
          >
            <option value="all">All Reports ({summary.total_incidents})</option>
            <option value="emergency">Emergency SOS ({summary.open_emergencies})</option>
            <option value="accidents">Accidents & Hazards ({summary.active_accidents})</option>
            <option value="vehicle">Vehicle Issues</option>
            <option value="underReview">Under Review ({summary.under_review})</option>
            <option value="resolved">Resolved ({summary.resolved})</option>
          </select>
        </label>
      </div>
    </div>
  )
}
