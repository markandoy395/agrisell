import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchFarmerRiderRequests } from '../../api/deliveries'
import { getApiErrorMessage } from '../../api/adminAuth'
import { Icon } from '../../components/ui/icon/Icon'
import type {
  FarmerRiderRequestsResponse,
  FarmerRiderRequestStatus,
} from '../../types/delivery'

type Props = {
  search: string
  onAssignRider: (deliveryId: number, preferredRiderId?: string) => void
  onViewDelivery: (deliveryId: number) => void
  onCountsChanged?: (counts: { pending: number; total: number }) => void
}

export function FarmerRiderRequestsPanel({
  search,
  onAssignRider,
  onViewDelivery,
  onCountsChanged,
}: Props) {
  const [data, setData] = useState<FarmerRiderRequestsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [localQuery, setLocalQuery] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const countsRef = useRef(onCountsChanged)
  useEffect(() => {
    countsRef.current = onCountsChanged
  }, [onCountsChanged])

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetchFarmerRiderRequests()
      setData(response)
      countsRef.current?.({
        pending: response.pending_count,
        total: response.total,
      })
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'Could not load farmer rider requests.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const filteredRequests = useMemo(() => {
    if (!data?.rows) return []
    return data.rows.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false
      const query = `${search} ${localQuery}`.trim().toLowerCase()
      if (!query) return true
      return (
        String(req.order_id ?? '').toLowerCase().includes(query) ||
        String(req.delivery_id).toLowerCase().includes(query) ||
        req.seller_order_id.toLowerCase().includes(query) ||
        req.farmer_name.toLowerCase().includes(query) ||
        (req.farm_name ?? '').toLowerCase().includes(query) ||
        req.rider_name.toLowerCase().includes(query) ||
        (req.rider_phone ?? '').toLowerCase().includes(query) ||
        (req.farm_location ?? '').toLowerCase().includes(query) ||
        (req.customer_name ?? '').toLowerCase().includes(query)
      )
    })
  }, [data?.rows, localQuery, search, statusFilter])

  const formatSchedule = (iso: string) => {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return 'Not scheduled'
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatExpiry = (expiresAt: string, status: FarmerRiderRequestStatus) => {
    if (status !== 'pending') return null
    const diff = new Date(expiresAt).getTime() - now
    if (diff <= 0) return <span className="farmer-expiry-timer expired">Expired</span>
    const mins = Math.floor(diff / 60000)
    if (mins < 60) {
      return <span className="farmer-expiry-timer">Expires in {mins}m</span>
    }
    const hours = Math.floor(mins / 60)
    return <span className="farmer-expiry-timer">Expires in {hours}h {mins % 60}m</span>
  }

  return (
    <div className="farmer-requests-panel">
      <header className="farmer-requests-header">
        <div>
          <h2>
            <span>🌾</span> Farmer-Rider Selection & Dispatch Pipeline
          </h2>
          <p>
            Monitor direct rider requests dispatched by farmers from the mobile app, inspect
            dispatch pipeline statuses, and review pending fulfillment reservations.
          </p>
        </div>
        <div className="farmer-requests-header-actions">
          <button
            type="button"
            className="farmer-refresh-btn"
            onClick={loadRequests}
            disabled={loading}
          >
            <Icon name="refresh" size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {error && (
        <p className="rider-tracking-error" role="alert">
          {error}
        </p>
      )}

      {/* Metric Cards */}
      <section className="farmer-requests-metrics" aria-label="Dispatch metrics">
        <div className="farmer-metric-card total">
          <span className="farmer-metric-label">
            Total Invitations
            <Icon name="truck" size={16} />
          </span>
          <strong className="farmer-metric-value">{data?.total ?? 0}</strong>
        </div>
        <div className="farmer-metric-card pending">
          <span className="farmer-metric-label">
            Pending Rider Response
            <span className="farmer-metric-badge pending">Awaiting</span>
          </span>
          <strong className="farmer-metric-value">{data?.pending_count ?? 0}</strong>
        </div>
        <div className="farmer-metric-card accepted">
          <span className="farmer-metric-label">
            Accepted & Dispatched
            <span className="farmer-metric-badge accepted">Active</span>
          </span>
          <strong className="farmer-metric-value">{data?.accepted_count ?? 0}</strong>
        </div>
        <div className="farmer-metric-card closed">
          <span className="farmer-metric-label">
            Declined / Expired / Other
            <Icon name="calendar" size={16} />
          </span>
          <strong className="farmer-metric-value">
            {(data?.declined_count ?? 0) +
              (data?.expired_count ?? 0) +
              (data?.cancelled_count ?? 0) +
              (data?.failed_count ?? 0)}
          </strong>
        </div>
      </section>

      {/* Filters & Search Toolbar */}
      <div className="farmer-requests-toolbar dashboard-filter-grid">
        <label className="farmer-requests-search dashboard-filter-field">
          <span>Search</span>
          <span className="dashboard-filter-control">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Order, delivery, farmer, farm, or rider..."
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
            />
          </span>
        </label>
        <label className="dashboard-filter-field">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          {[
            { id: 'all', label: 'All', count: data?.total ?? 0 },
            { id: 'pending', label: 'Pending', count: data?.pending_count ?? 0 },
            { id: 'accepted', label: 'Accepted', count: data?.accepted_count ?? 0 },
            { id: 'declined', label: 'Declined', count: data?.declined_count ?? 0 },
            { id: 'expired', label: 'Expired', count: data?.expired_count ?? 0 },
            { id: 'cancelled', label: 'Cancelled', count: data?.cancelled_count ?? 0 },
          ].map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label} ({tab.count})
            </option>
          ))}
          </select>
        </label>
      </div>

      {/* Requests List */}
      {loading && !data ? (
        <div className="delivery-loading-popup" role="status">
          <Icon name="refresh" size={16} />
          <span>Loading farmer requests pipeline…</span>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="farmer-requests-empty">
          <div className="farmer-requests-empty-icon">
            <Icon name="truck" size={26} />
          </div>
          <h3>No Farmer Rider Requests Found</h3>
          <p>
            {localQuery || search || statusFilter !== 'all'
              ? 'No requests matched your filter or search query. Try clearing filters.'
              : 'When farmers select candidate riders via the mobile app, their invitations and fulfillment pipelines will appear here.'}
          </p>
        </div>
      ) : (
        <div className="farmer-requests-list">
          {filteredRequests.map((req) => {
            return (
              <article key={req.request_id} className={`farmer-request-card ${req.status}`}>
                {/* IDs & Timeline */}
                <div className="farmer-req-id-col">
                  <span className="farmer-order-tag">
                    {req.order_id ? `ORD-${req.order_id}` : req.seller_order_id}
                  </span>
                  <span className="farmer-delivery-tag">DEL-{req.delivery_id}</span>
                  <span className="farmer-req-time" title={req.requested_at}>
                    Req: {new Date(req.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                {/* Farmer / Farm Info */}
                <div className="farmer-entity-cell">
                  <div className="farmer-entity-avatar" aria-hidden="true">
                    {req.farmer_image_url ? (
                      <img src={req.farmer_image_url} alt="" />
                    ) : (
                      req.farmer_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="farmer-entity-info">
                    <strong>{req.farmer_name}</strong>
                    <small>🏡 {req.farm_name || 'Farm'}</small>
                    <small title={req.farm_location || ''}>
                      📍 {req.farm_location || 'Location unavailable'}
                    </small>
                  </div>
                </div>

                {/* Rider Info */}
                <div className="farmer-entity-cell">
                  <div className="farmer-entity-avatar" aria-hidden="true">
                    {req.rider_photo_url ? (
                      <img src={req.rider_photo_url} alt="" />
                    ) : (
                      req.rider_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="farmer-entity-info">
                    <strong>{req.rider_name}</strong>
                    <small>📞 {req.rider_phone || 'No phone'}</small>
                    <span className="farmer-rider-badge">
                      {req.rider_vehicle_type || 'Vehicle'} · {req.rider_availability_status || 'offline'}
                    </span>
                  </div>
                </div>

                {/* Schedule & Fee & Status */}
                <div className="farmer-schedule-cell">
                  <div className="farmer-schedule-row" title="Requested pickup schedule">
                    <Icon name="calendar" size={13} />
                    <span>{formatSchedule(req.requested_schedule)}</span>
                  </div>
                  <div className="farmer-fee-row">
                    <span>
                      {req.proposed_delivery_fee !== null
                        ? `Proposed: ₱${Number(req.proposed_delivery_fee).toFixed(2)}`
                        : 'Standard Rate'}
                    </span>
                  </div>
                  <div className="farmer-status-cell">
                    <span className={`farmer-req-status-pill ${req.status}`}>
                      <i />
                      {req.status}
                    </span>
                    {formatExpiry(req.expires_at, req.status)}
                    {req.failure_reason && (
                      <span className="farmer-failure-note" title={req.failure_reason}>
                        Note: {req.failure_reason}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="farmer-actions-cell">
                  <button
                    type="button"
                    className="farmer-action-assign"
                    onClick={() => onAssignRider(req.delivery_id, req.rider_id)}
                  >
                    <Icon name="profile" size={14} />
                    <span>Assign / Review</span>
                  </button>
                  <button
                    type="button"
                    className="farmer-action-view"
                    onClick={() => onViewDelivery(req.delivery_id)}
                  >
                    View Delivery
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
