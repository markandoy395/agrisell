import { useEffect, useState, type FormEvent } from 'react'
import {
  fetchAudienceCounts,
  sendBroadcast,
  type AudienceCounts,
  type BroadcastDestination,
  type BroadcastNotificationType,
  type BroadcastPayload,
  type BroadcastTargetSegment,
} from '../../../api/adminData'
import { getApiErrorMessage } from '../../../api/adminAuth'
import { CloseButton } from '../closeButton/CloseButton'
import { Icon } from '../icon/Icon'
import './BroadcastAnnouncementModal.css'

type BroadcastAnnouncementModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: (message: string) => void
}

const TEMPLATES: Array<{
  label: string
  title: string
  message: string
  segment: BroadcastTargetSegment
  type: BroadcastNotificationType
  destination: BroadcastDestination
}> = [
  {
    label: 'Produce Flash Sale',
    title: 'Weekend Fresh Harvest Promo',
    message: 'Enjoy up to 20% off farm-fresh vegetables and fruits this weekend only! Check out newly listed produce from local partner farms.',
    segment: 'buyers',
    type: 'marketing',
    destination: 'products',
  },
  {
    label: 'Maintenance Notice',
    title: 'Scheduled System Maintenance',
    message: 'The Agrisell platform will undergo routine system optimization tonight from 11:00 PM to 1:00 AM. Thank you for your patience.',
    segment: 'all',
    type: 'system_update',
    destination: 'none',
  },
  {
    label: 'Weather Alert',
    title: 'Weather Advisory: Delivery Delays',
    message: 'Due to severe weather conditions, order dispatch and rider delivery transit times may experience temporary delays in affected provinces. Please stay safe.',
    segment: 'all',
    type: 'warning',
    destination: 'deliveries',
  },
  {
    label: 'Farmer Payout Milestone',
    title: 'Farmer Direct Payout Updates',
    message: 'Weekly earnings and GCash order settlement payouts have been processed. Please check your account earnings breakdown.',
    segment: 'farmers',
    type: 'announcement',
    destination: 'account',
  },
]

export function BroadcastAnnouncementModal({
  isOpen,
  onClose,
  onSuccess,
}: BroadcastAnnouncementModalProps) {
  const [targetSegment, setTargetSegment] = useState<BroadcastTargetSegment>('all')
  const [notificationType, setNotificationType] = useState<BroadcastNotificationType>('announcement')
  const [destination, setDestination] = useState<BroadcastDestination>('none')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<AudienceCounts>({
    all: 0,
    buyers: 0,
    farmers: 0,
    riders: 0,
  })
  const [isLoadingCounts, setIsLoadingCounts] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setIsLoadingCounts(true)
    fetchAudienceCounts(controller.signal)
      .then((data) => setCounts(data))
      .catch(() => {})
      .finally(() => setIsLoadingCounts(false))

    return () => controller.abort()
  }, [isOpen])

  if (!isOpen) return null

  const handleApplyTemplate = (template: (typeof TEMPLATES)[number]) => {
    setTitle(template.title)
    setMessage(template.message)
    setTargetSegment(template.segment)
    setNotificationType(template.type)
    setDestination(template.destination)
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Please provide an announcement title.')
      return
    }
    if (!message.trim()) {
      setError('Please enter the announcement body.')
      return
    }

    const payload: BroadcastPayload = {
      title: title.trim(),
      message: message.trim(),
      targetSegment,
      notificationType,
      destination,
    }

    setIsSending(true)
    try {
      const response = await sendBroadcast(payload)
      onSuccess(
        `Announcement broadcasted successfully to ${response.recipientCount} ${
          targetSegment === 'all' ? 'active users' : targetSegment
        }!`,
      )
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to broadcast announcement. Please try again.'))
    } finally {
      setIsSending(false)
    }
  }

  const segmentAudienceSize = counts[targetSegment] ?? 0

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-card modal-card--broadcast"
        role="dialog"
        aria-modal="true"
        aria-labelledby="broadcast-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-header-top">
            <span className="modal-eyebrow">
              <Icon name="broadcast" size={13} />
              <span>USER-FACING NOTIFICATION BROADCAST</span>
            </span>
            <CloseButton label="Close broadcast modal" onClick={onClose} />
          </div>
          <h2 id="broadcast-modal-title">Broadcast Announcement to Mobile Apps</h2>
          <p className="modal-description">
            Publish platform announcements, flash sales, or urgent service updates directly to
            buyer and farmer notification feeds and push notification lockscreens.
          </p>
        </header>

        {error && (
          <div className="broadcast-error-banner" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}

        <form className="broadcast-form" onSubmit={handleSubmit}>
          <div className="broadcast-layout">
            {/* Left Column: Form Controls */}
            <div className="broadcast-controls">
              {/* Target Segment */}
              <div className="broadcast-field-group">
                <label className="broadcast-label">
                  Target User Segment
                  <span className="broadcast-audience-indicator">
                    {isLoadingCounts ? 'Calculating...' : `${segmentAudienceSize} reachable accounts`}
                  </span>
                </label>
                <div className="broadcast-segment-grid" role="radiogroup" aria-label="Target Segment">
                  <button
                    type="button"
                    className={`broadcast-segment-card${targetSegment === 'all' ? ' active' : ''}`}
                    onClick={() => setTargetSegment('all')}
                  >
                    <div className="segment-card-header">
                      <Icon name="users" size={17} />
                      <strong>All Mobile Users</strong>
                      {targetSegment === 'all' && (
                        <span className="segment-card-check">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </div>
                    <span className="segment-card-count">
                      {isLoadingCounts ? '...' : counts.all} accounts
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`broadcast-segment-card${targetSegment === 'buyers' ? ' active' : ''}`}
                    onClick={() => setTargetSegment('buyers')}
                  >
                    <div className="segment-card-header">
                      <Icon name="basket" size={17} />
                      <strong>Buyers Only</strong>
                      {targetSegment === 'buyers' && (
                        <span className="segment-card-check">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </div>
                    <span className="segment-card-count">
                      {isLoadingCounts ? '...' : counts.buyers} accounts
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`broadcast-segment-card${targetSegment === 'farmers' ? ' active' : ''}`}
                    onClick={() => setTargetSegment('farmers')}
                  >
                    <div className="segment-card-header">
                      <Icon name="sprout" size={17} />
                      <strong>Farmers Only</strong>
                      {targetSegment === 'farmers' && (
                        <span className="segment-card-check">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </div>
                    <span className="segment-card-count">
                      {isLoadingCounts ? '...' : counts.farmers} accounts
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`broadcast-segment-card${targetSegment === 'riders' ? ' active' : ''}`}
                    onClick={() => setTargetSegment('riders')}
                  >
                    <div className="segment-card-header">
                      <Icon name="rider" size={17} />
                      <strong>Riders Fleet</strong>
                      {targetSegment === 'riders' && (
                        <span className="segment-card-check">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </div>
                    <span className="segment-card-count">
                      {isLoadingCounts ? '...' : counts.riders} accounts
                    </span>
                  </button>
                </div>
              </div>

              {/* Type and Destination Row */}
              <div className="broadcast-field-row">
                <div className="broadcast-field-group">
                  <label htmlFor="broadcast-type" className="broadcast-label">
                    Notification Type
                  </label>
                  <select
                    id="broadcast-type"
                    value={notificationType}
                    onChange={(e) => setNotificationType(e.target.value as BroadcastNotificationType)}
                  >
                    <option value="announcement">Platform Announcement</option>
                    <option value="marketing">Promotions & Deals</option>
                    <option value="system_update">System Maintenance</option>
                    <option value="warning">Urgent / Weather Alert</option>
                  </select>
                </div>

                <div className="broadcast-field-group">
                  <label htmlFor="broadcast-dest" className="broadcast-label">
                    Deep-Link Destination
                  </label>
                  <select
                    id="broadcast-dest"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value as BroadcastDestination)}
                  >
                    <option value="none">None (Notification Feed)</option>
                    <option value="products">Product Marketplace</option>
                    <option value="orders">Orders Screen</option>
                    <option value="deliveries">Deliveries Hub</option>
                    <option value="account">Account & Earnings</option>
                    <option value="messages">Customer Messages</option>
                  </select>
                </div>
              </div>

              {/* Quick Preset Templates */}
              <div className="broadcast-field-group">
                <span className="broadcast-label-sub">Quick Templates:</span>
                <div className="broadcast-template-chips">
                  {TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.label}
                      type="button"
                      className="broadcast-template-chip"
                      onClick={() => handleApplyTemplate(tmpl)}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title Input */}
              <div className="broadcast-field-group">
                <div className="broadcast-label-with-meta">
                  <label htmlFor="broadcast-title" className="broadcast-label">
                    Notification Title
                  </label>
                  <span className="broadcast-char-count">{title.length}/150</span>
                </div>
                <input
                  id="broadcast-title"
                  type="text"
                  placeholder="e.g. Weekend Produce Sale or Scheduled System Maintenance"
                  value={title}
                  maxLength={150}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Message Body */}
              <div className="broadcast-field-group">
                <div className="broadcast-label-with-meta">
                  <label htmlFor="broadcast-message" className="broadcast-label">
                    Message Content
                  </label>
                  <span className="broadcast-char-count">{message.length}/2000</span>
                </div>
                <textarea
                  id="broadcast-message"
                  rows={3}
                  placeholder="Write clear, concise announcement details for mobile buyers and farmers..."
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Right Column: Live Mobile Push Preview */}
            <div className="broadcast-preview-col">
              <span className="broadcast-preview-title">
                <Icon name="eye" size={16} /> Live Lockscreen & Notification Preview
              </span>

              <div className="mobile-preview-device">
                <div className="mobile-preview-notch" />
                <div className="mobile-preview-statusbar">
                  <span>9:41</span>
                  <div className="mobile-preview-status-icons">
                    <span>5G</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="mobile-notification-card">
                  <div className="notification-card-topbar">
                    <div className="notification-app-badge">
                      <div className="app-icon-squircle">
                        <Icon name="leaf" size={14} />
                      </div>
                      <span className="app-name">AGRISELL</span>
                    </div>
                    <span className="notification-time-badge">now</span>
                  </div>

                  <div className="notification-card-body">
                    <strong className="notification-card-title">
                      {title.trim() || 'Announcement Title'}
                    </strong>
                    <p className="notification-card-desc">
                      {message.trim() ||
                        'Type your announcement content to see how it looks on mobile app user devices.'}
                    </p>
                  </div>

                  <div className="notification-card-footer">
                    <span className={`notification-pill notification-pill--${notificationType}`}>
                      {notificationType.replace('_', ' ')}
                    </span>
                    {destination !== 'none' && (
                      <span className="notification-dest-tag">
                        Tap: {destination}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mobile-preview-homebar" />
              </div>

              <div className="broadcast-dispatch-summary">
                <div className="summary-row">
                  <span>Segment</span>
                  <strong>{targetSegment.toUpperCase()}</strong>
                </div>
                <div className="summary-row">
                  <span>Estimated Audience</span>
                  <strong>{isLoadingCounts ? '...' : `${segmentAudienceSize} users`}</strong>
                </div>
                <div className="summary-row">
                  <span>Destination</span>
                  <strong>{destination === 'none' ? 'In-app feed' : destination}</strong>
                </div>
              </div>
            </div>
          </div>

          <footer className="modal-actions broadcast-actions">
            <button
              type="button"
              className="outline-button"
              onClick={onClose}
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button-primary broadcast-submit-btn"
              disabled={isSending || !title.trim() || !message.trim()}
            >
              {isSending ? (
                <>
                  <Icon name="refresh" size={16} />
                  <span>Broadcasting...</span>
                </>
              ) : (
                <>
                  <Icon name="broadcast" size={16} />
                  <span>Send Broadcast ({segmentAudienceSize} Users)</span>
                </>
              )}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
