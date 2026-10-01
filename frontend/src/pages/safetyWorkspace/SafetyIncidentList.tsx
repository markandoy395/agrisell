import { Icon } from '../../components/ui/icon/Icon'
import type { SafetyIncident } from './safetyWorkspace.types'

type SafetyIncidentListProps = {
  incidents: SafetyIncident[]
  isLoading: boolean
  busyIncidentId: string | null
  onResolve: (incident: SafetyIncident) => void
  onCallContact?: (incident: SafetyIncident) => void
}

export function SafetyIncidentList({
  incidents,
  isLoading,
  busyIncidentId,
  onResolve,
  onCallContact,
}: SafetyIncidentListProps) {
  if (isLoading && incidents.length === 0) {
    return (
      <div className="safety-loading-state">
        <span className="spinner" />
        <p>Loading safety incidents and SOS monitoring feed…</p>
      </div>
    )
  }

  if (incidents.length === 0) {
    return (
      <div className="safety-empty-state">
        <div className="safety-empty-icon">
          <Icon name="shield" size={48} />
        </div>
        <h3>No safety incidents found</h3>
        <p>All active rider deliveries are proceeding without reported safety issues.</p>
      </div>
    )
  }

  return (
    <div className="safety-incidents-feed" role="feed" aria-label="Rider safety incident reports">
      {incidents.map((incident) => (
        <SafetyIncidentCard
          key={incident.report_id}
          incident={incident}
          isBusy={busyIncidentId === incident.report_id}
          onResolve={() => onResolve(incident)}
          onCallContact={() => onCallContact?.(incident)}
        />
      ))}
    </div>
  )
}

function SafetyIncidentCard({
  incident,
  isBusy,
  onResolve,
  onCallContact,
}: {
  incident: SafetyIncident
  isBusy: boolean
  onResolve: () => void
  onCallContact: () => void
}) {
  const isEmergency =
    incident.category === 'emergencySos' || incident.report_type === 'safety_action'
  const isResolved = incident.status === 'resolved' || incident.status === 'rejected'
  const hasGps = typeof incident.latitude === 'number' && typeof incident.longitude === 'number'

  const role = incident.reporter_role || (incident.rider_id ? 'rider' : 'buyer')
  const reporterRoleLabel = role === 'buyer' ? 'BUYER' : role === 'farmer' ? 'FARMER' : 'RIDER'
  const reporterName =
    incident.reporter?.name ||
    incident.reporter_name ||
    incident.rider?.full_name ||
    `${reporterRoleLabel} Reporter`
  const contactNumber =
    incident.reporter?.contact_number ||
    incident.reporter_contact ||
    incident.rider?.contact_number
  const email = incident.reporter?.email || incident.reporter_email || incident.rider?.email

  const categoryLabel = formatCategory(incident.category)
  const statusBadge = formatStatus(incident.status)

  const reportedDate = new Date(incident.reported_at || incident.created_at)
  const timeAgo = formatTimeAgo(reportedDate)
  const exactDate = formatExactDate(reportedDate)

  return (
    <article
      className={`safety-incident-card ${isEmergency && !isResolved ? 'is-emergency-card' : ''} ${isResolved ? 'is-resolved-card' : ''}`}
    >
      {/* Top Header Row */}
      <header className="incident-header-row">
        <div className="incident-tags-group">
          {isEmergency ? (
            <span className="incident-badge badge-sos">
              <Icon name="siren" size={14} />
              <span>EMERGENCY SOS</span>
            </span>
          ) : (
            <span className="incident-badge badge-standard">
              <Icon name="warning" size={14} />
              <span>{categoryLabel.toUpperCase()}</span>
            </span>
          )}

          <span className={`incident-badge role-badge role-${role}`}>
            <Icon name="profile" size={14} />
            <span>{reporterRoleLabel}</span>
          </span>

          <span className={`incident-badge status-badge status-${incident.status}`}>
            <Icon name="clock" size={14} />
            <span>{statusBadge.label}</span>
          </span>

          <span className="incident-report-id">ID: {incident.report_id}</span>
        </div>

        <div className="incident-time-group" title={incident.reported_at || incident.created_at}>
          <div className="time-ago-row">
            <Icon name="clock" size={14} />
            <span>{timeAgo}</span>
          </div>
          {exactDate && <span className="time-exact">{exactDate}</span>}
        </div>
      </header>

      {/* Main Body Grid */}
      <div className="incident-body-grid">
        {/* Left Column: Reporter & Delivery/Order Details */}
        <section className="incident-entity-column">
          <div className="entity-block">
            <span className="entity-block-label">{reporterRoleLabel} DETAILS</span>
            <div className="entity-detail-list">
              <div className="entity-detail-row detail-name">
                <span className="detail-icon-wrap user-icon">
                  <Icon name="profile" size={16} />
                </span>
                <strong className="rider-name">{reporterName}</strong>
              </div>

              {contactNumber && (
                <button
                  type="button"
                  onClick={onCallContact}
                  className="entity-detail-row detail-phone"
                  title={`Call ${reporterRoleLabel.toLowerCase()} directly`}
                >
                  <span className="detail-icon-wrap phone-icon">
                    <Icon name="phone" size={15} />
                  </span>
                  <span>{contactNumber}</span>
                </button>
              )}

              {email && (
                <div className="entity-detail-row detail-email" title={email}>
                  <span className="detail-icon-wrap mail-icon">
                    <Icon name="mail" size={15} />
                  </span>
                  <span>{email}</span>
                </div>
              )}

              {role === 'rider' && incident.rider?.vehicle_type && (
                <div className="entity-detail-row detail-vehicle">
                  <span className="detail-icon-wrap vehicle-icon">
                    <Icon name="car" size={15} />
                  </span>
                  <span>
                    {incident.rider.vehicle_type}
                    {incident.rider.plate_number ? ` · ${incident.rider.plate_number}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {incident.order_id && !incident.delivery && (
            <div className="entity-block">
              <span className="entity-block-label">ORDER REFERENCE</span>
              <span className="delivery-ref">Order #{incident.order_id}</span>
            </div>
          )}

          {incident.delivery && (
            <div className="entity-block">
              <span className="entity-block-label">DELIVERY & ORDER</span>
              <span className="delivery-ref">
                Delivery #{incident.delivery.delivery_id} (Order #{incident.delivery.order_id})
              </span>
              <span className="delivery-stage-tag">{incident.delivery.delivery_status}</span>
              {incident.delivery.pickup_location && (
                <small className="route-location">
                  <strong>From:</strong> {incident.delivery.pickup_location}
                </small>
              )}
              {incident.delivery.dropoff_location && (
                <small className="route-location">
                  <strong>To:</strong> {incident.delivery.dropoff_location}
                </small>
              )}
            </div>
          )}

          {hasGps && (
            <div className="entity-block gps-block">
              <span className="entity-block-label">GPS LOCATION AT REPORT</span>
              <span className="gps-coordinates">
                {incident.latitude?.toFixed(5)}, {incident.longitude?.toFixed(5)}
                {incident.accuracy_meters ? ` (±${Math.round(incident.accuracy_meters)}m)` : ''}
              </span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${incident.latitude},${incident.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="maps-link"
              >
                <Icon name="route" size={14} />
                <span>View on Google Maps</span>
              </a>
            </div>
          )}
        </section>

        {/* Right Column: Statement, Requested Actions & Attachments */}
        <section className="incident-content-column">
          <div className="incident-description-box">
            <span className="content-label">RIDER STATEMENT / DESCRIPTION</span>
            <p className="incident-description-text">
              {incident.description || 'EMERGENCY SOS: User triggered immediate distress signal.'}
            </p>
          </div>

          {/* Requested Actions */}
          {incident.requested_actions && incident.requested_actions.length > 0 && (
            <div className="requested-actions-group">
              <span className="content-label">REQUESTED ACTIONS</span>
              <div className="action-pills">
                {incident.requested_actions.map((action) => (
                  <span key={action} className="action-pill">
                    <Icon name={getActionIcon(action)} size={13} />
                    <span>{formatActionLabel(action)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Attachments */}
          {incident.attachments && incident.attachments.length > 0 && (
            <div className="incident-attachments-group">
              <span className="content-label">EVIDENCE ATTACHMENTS ({incident.attachments.length})</span>
              <div className="attachment-thumbnails">
                {incident.attachments.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="attachment-thumb"
                  >
                    <Icon name="camera" size={16} />
                    <span>Evidence #{i + 1}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Resolution Audit Box (if resolved/reviewed) */}
          {incident.resolution_notes && (
            <div className="resolution-audit-box">
              <div className="resolution-audit-header">
                <Icon name="checkCircle" size={16} />
                <strong>RESOLUTION AUDIT NOTE</strong>
                {incident.resolved_by && <span> · Resolved by {incident.resolved_by}</span>}
              </div>
              <p className="resolution-notes-text">{incident.resolution_notes}</p>
            </div>
          )}
        </section>
      </div>

      {/* Card Actions Footer */}
      <footer className="incident-card-footer">
        <div className="footer-left">
          {contactNumber ? (
            <button
              type="button"
              className="btn-call-outline"
              onClick={onCallContact}
            >
              <Icon name="phone" size={15} />
              <span>Call {reporterRoleLabel}</span>
            </button>
          ) : (
            <div />
          )}
        </div>
        <div className="footer-right">
          <button
            type="button"
            className="btn-resolve-solid"
            disabled={isBusy}
            onClick={onResolve}
          >
            <Icon name="checkCircle" size={16} />
            <span>
              {isBusy
                ? 'Saving…'
                : isResolved
                  ? 'Update Resolution'
                  : isEmergency
                    ? 'Resolve Emergency SOS'
                    : 'Resolve Incident'}
            </span>
          </button>
        </div>
      </footer>
    </article>
  )
}

function getActionIcon(action: string): 'tag' | 'headset' | 'route' | 'camera' {
  const lower = action.toLowerCase()
  if (lower.includes('contact') || lower.includes('support') || lower.includes('call') || lower.includes('headset')) {
    return 'headset'
  }
  if (lower.includes('location') || lower.includes('gps') || lower.includes('route')) {
    return 'route'
  }
  if (lower.includes('camera') || lower.includes('photo') || lower.includes('evidence')) {
    return 'camera'
  }
  return 'tag'
}

function formatActionLabel(action: string): string {
  return action
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

function formatExactDate(date: Date): string {
  if (isNaN(date.getTime())) return ''
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${dateStr} ${timeStr}`
}

function formatCategory(category: string): string {
  switch (category) {
    case 'emergencySos':
      return 'Emergency SOS'
    case 'accident':
      return 'Traffic Accident'
    case 'medicalEmergency':
      return 'Medical Emergency'
    case 'vehicleBreakdown':
      return 'Vehicle Breakdown'
    case 'theft':
      return 'Theft / Robbery'
    case 'harassment':
      return 'Harassment / Threat'
    case 'roadClosure':
      return 'Road Closure / Blockade'
    case 'severeWeather':
      return 'Severe Weather / Flood'
    case 'unsafePickup':
      return 'Unsafe Pickup Location'
    case 'unsafeDestination':
      return 'Unsafe Dropoff Location'
    case 'suspiciousProduct':
      return 'Suspicious Package'
    case 'suspiciousCustomer':
      return 'Suspicious Customer'
    case 'safety_action':
      return 'Safety Distress Signal'
    default:
      return category.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
  }
}

function formatStatus(status: string): { label: string } {
  switch (status) {
    case 'submitted':
      return { label: 'Open / Pending Triage' }
    case 'underReview':
      return { label: 'Under Investigation' }
    case 'waitingForInformation':
      return { label: 'Waiting for Information' }
    case 'escalated':
      return { label: 'Escalated' }
    case 'resolved':
      return { label: 'Resolved' }
    case 'rejected':
      return { label: 'Dismissed' }
    default:
      return { label: status }
  }
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

