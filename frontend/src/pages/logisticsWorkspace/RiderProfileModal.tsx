import { useEffect, useState } from 'react'
import { getVerificationDetail } from '../../api/adminData'
import type { VerificationDetail } from '../../api/adminData'
import { Icon } from '../../components/ui/icon/Icon'
import type { IconName } from '../../types/icon'
import type { EntityRecord } from '../../types/dashboard'
import { getRiderInitials } from './logisticsWorkspace.utils'
import './RiderProfileModal.css'

type Tab = 'overview' | 'vehicle' | 'documents' | 'activity'

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'vehicle', label: 'Vehicle & Deliveries', icon: 'truck' },
  { id: 'documents', label: 'Documents', icon: 'document' },
  { id: 'activity', label: 'Activity Logs', icon: 'info' },
]

const value = (input: unknown, fallback = 'Not recorded') =>
  typeof input === 'string' && input.trim()
    ? input
    : typeof input === 'number' && Number.isFinite(input)
      ? String(input)
      : fallback

const date = (input: unknown) => {
  if (typeof input !== 'string' || !input) return 'Not recorded'
  const parsed = new Date(input)
  return Number.isNaN(parsed.getTime())
    ? 'Not recorded'
    : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: IconName
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rider-profile-row">
      <Icon name={icon} size={17} />
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  )
}

export function RiderProfileModal({
  rider,
  onClose,
  onReview,
}: {
  rider: EntityRecord
  onClose: () => void
  onReview: () => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [detail, setDetail] = useState<VerificationDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!rider.entityId) return
    let active = true
    getVerificationDetail('rider', rider.entityId)
      .then((result) => {
        if (active) setDetail(result)
      })
      .catch(() => {
        if (active) setError('Additional profile details could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [rider.entityId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const profile = detail?.profile ?? {}
  const email = value(
    profile.email,
    rider.secondary.includes('@') ? rider.secondary : 'Not recorded',
  )
  const phone = value(
    profile.contact_number,
    rider.secondary.includes('@') ? 'Not recorded' : rider.secondary,
  )
  const deliveries = value(
    profile.total_deliveries,
    rider.value.match(/(\d+) deliveries?/)?.[1] ?? 'Not recorded',
  )
  const rating = value(profile.average_rating, 'Not rated')
  const approval = rider.approvalStatus ?? 'Pending approval'
  const vehicle = value(profile.vehicle_type, rider.value.split(' · ')[0])

  return (
    <div className="modal-backdrop rider-profile-backdrop" onMouseDown={onClose}>
      <section
        className="rider-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rider-profile-heading">
          <h2 id="rider-profile-title">Rider Profile</h2>
          <button
            type="button"
            className="rider-profile-x"
            aria-label="Close rider profile"
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="rider-profile-summary">
          <div className="rider-profile-avatar">{getRiderInitials(rider.primary)}</div>
          <div className="rider-profile-identity">
            <h3>{rider.primary}</h3>
            <span className="rider-profile-approved">
              ● &nbsp;{approval === 'Approved' ? 'Approved Rider' : approval}
            </span>
            <span>
              <Icon name="mail" size={15} />
              {email}
            </span>
            <span>
              <Icon name="phone" size={15} />
              {phone}
            </span>
          </div>
          <div className="rider-profile-metric">
            <strong>{deliveries}</strong>
            <span>Total Deliveries</span>
          </div>
          <div className="rider-profile-metric">
            <strong>{rating}</strong>
            <span>Rating</span>
          </div>
        </div>
        <nav className="rider-profile-tabs" aria-label="Rider profile sections">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        {error && (
          <p className="rider-profile-error" role="alert">
            {error}
          </p>
        )}
        <div className="rider-profile-content">
          {tab === 'overview' && (
            <div className="rider-profile-grid">
              <section className="rider-profile-card">
                <h3>Personal Information</h3>
                <InfoRow icon="profile" label="Full Name">
                  {rider.primary}
                </InfoRow>
                <InfoRow icon="mail" label="Email Address">
                  {email}
                </InfoRow>
                <InfoRow icon="phone" label="Phone Number">
                  {phone}
                </InfoRow>
                <InfoRow icon="home" label="Affiliation / Company">
                  {rider.category}
                </InfoRow>
                <InfoRow icon="calendar" label="Date Joined">
                  {date(profile.created_at)}
                </InfoRow>
              </section>
              <section className="rider-profile-card">
                <h3>
                  Account Status <span className="rider-profile-status">{approval}</span>
                </h3>
                <InfoRow icon="shield" label="Current Status">
                  {rider.status}
                </InfoRow>
                <InfoRow icon="clock" label="Availability">
                  {rider.status}
                </InfoRow>
                <InfoRow icon="truck" label="Total Deliveries">
                  {deliveries}
                </InfoRow>
                <InfoRow icon="star" label="Average Rating">
                  {rating}
                </InfoRow>
              </section>
              <section className="rider-profile-card">
                <h3>Vehicle Information</h3>
                <InfoRow icon="truck" label="Vehicle Type">
                  {vehicle}
                </InfoRow>
                <InfoRow icon="card" label="Plate Number">
                  {value(profile.vehicle_plate_number, 'N/A')}
                </InfoRow>
                <InfoRow icon="route" label="Total Deliveries">
                  {deliveries}
                </InfoRow>
              </section>
              <section className="rider-profile-card">
                <h3>Statistics</h3>
                <InfoRow icon="checkCircle" label="Completed Deliveries">
                  {value(profile.completed_deliveries)}
                </InfoRow>
                <InfoRow icon="close" label="Cancelled Deliveries">
                  {value(profile.cancelled_deliveries)}
                </InfoRow>
                <InfoRow icon="alert" label="Active Incidents">
                  {value(profile.active_incidents)}
                </InfoRow>
                <InfoRow icon="document" label="Total Reports">
                  {value(profile.total_reports)}
                </InfoRow>
              </section>
            </div>
          )}
          {tab === 'vehicle' && (
            <div className="rider-profile-grid">
              <section className="rider-profile-card">
                <h3>Vehicle Information</h3>
                <InfoRow icon="truck" label="Vehicle Type">
                  {vehicle}
                </InfoRow>
                <InfoRow icon="card" label="Plate Number">
                  {value(profile.vehicle_plate_number, 'N/A')}
                </InfoRow>
                <InfoRow icon="card" label="License Number">
                  {value(profile.license_number)}
                </InfoRow>
              </section>
              <section className="rider-profile-card">
                <h3>Deliveries</h3>
                <InfoRow icon="route" label="Total Deliveries">
                  {deliveries}
                </InfoRow>
                <InfoRow icon="checkCircle" label="Completed">
                  {value(profile.completed_deliveries)}
                </InfoRow>
                <InfoRow icon="close" label="Cancelled">
                  {value(profile.cancelled_deliveries)}
                </InfoRow>
              </section>
            </div>
          )}
          {tab === 'documents' && (
            <section className="rider-profile-card">
              <h3>Documents</h3>
              {!detail ? (
                <p>{error || 'Loading documents…'}</p>
              ) : detail.documents.length ? (
                detail.documents.map((document) => (
                  <div className="rider-profile-document" key={document.document_id}>
                    <Icon name="document" size={18} />
                    <span>
                      <strong>{document.document_type.replaceAll('_', ' ')}</strong>
                      <small>
                        {document.verification_status}
                        {document.expiry_date ? ` · Expires ${date(document.expiry_date)}` : ''}
                      </small>
                    </span>
                    {document.signed_url && (
                      <a href={document.signed_url} target="_blank" rel="noreferrer">
                        View
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <p>No documents recorded.</p>
              )}
            </section>
          )}
          {tab === 'activity' && (
            <section className="rider-profile-card">
              <h3>Activity Logs</h3>
              {!detail ? (
                <p>{error || 'Loading activity…'}</p>
              ) : detail.actions.length ? (
                detail.actions.map((action) => (
                  <div className="rider-profile-action" key={action.action_id}>
                    <strong>{action.action.replaceAll('_', ' ')}</strong>
                    <span>
                      {date(action.created_at)} · {action.actor_email}
                    </span>
                    {action.message && <p>{action.message}</p>}
                  </div>
                ))
              ) : (
                <p>No activity recorded.</p>
              )}
            </section>
          )}
        </div>
        <footer className="rider-profile-footer">
          <button type="button" onClick={onReview}>
            Review verification
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  )
}
