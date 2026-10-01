import { useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { Delivery, DeliveryOptions, FarmerRiderRequest } from '../../types/delivery'
import { isClosed, isOverdue, label } from '../../utils/delivery'

type Props = {
  delivery: Delivery
  riders: DeliveryOptions['riders']
  query: string
  selectedRiderId: string
  saving: boolean
  error: string
  farmerRequest?: FarmerRiderRequest | null
  onQueryChange: (value: string) => void
  onSelect: (id: string) => void
  onClose: () => void
  onConfirm: () => void
}

const LocationIcon = () => (
  <svg
    className="assign-rider-location-icon"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)

export function AssignRiderModal({
  delivery,
  riders,
  query,
  selectedRiderId,
  saving,
  error,
  farmerRequest,
  onQueryChange,
  onSelect,
  onClose,
  onConfirm,
}: Props) {
  const schedule = delivery.estimated_delivery_time
    ? new Date(delivery.estimated_delivery_time)
    : null
  const [now] = useState(() => Date.now())
  const tone = isOverdue(delivery, now)
    ? 'overdue'
    : isClosed(delivery.delivery_status)
      ? 'completed'
      : !delivery.rider_id
        ? 'unassigned'
        : 'active'
  const status = isOverdue(delivery, now)
    ? 'Overdue'
    : isClosed(delivery.delivery_status)
      ? label(delivery.delivery_status)
      : !delivery.rider_id
        ? 'Unassigned'
        : 'Active'
  const visible = riders.filter(
    (rider) =>
      !query.trim() ||
      `${rider.full_name} ${rider.contact_number} ${rider.vehicle_type} ${rider.availability_status}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  return (
    <section className="assign-rider-modal">
      <button
        className="assign-rider-close"
        type="button"
        onClick={onClose}
        disabled={saving}
        aria-label="Close assign rider"
      >
        <Icon name="close" size={22} />
      </button>
      <header>
        <h2>Assign Rider</h2>
        <p>Select a rider to assign to this delivery.</p>
      </header>
      <div className="assign-rider-delivery-summary">
        <div>
          <small>Order ID</small>
          <strong>ORD-{delivery.order_id}</strong>
        </div>
        <div>
          <small>Pickup</small>
          <span>
            <LocationIcon />
            <strong>{delivery.pickup_location || 'Not set'}</strong>
          </span>
        </div>
        <div>
          <small>Destination</small>
          <span>
            <LocationIcon />
            <strong>{delivery.dropoff_location || 'Not set'}</strong>
          </span>
        </div>
        <div>
          <span>
            <Icon name="calendar" size={21} />
            <span>
              <small>Schedule</small>
              <strong>
                {schedule && Number.isFinite(schedule.getTime())
                  ? schedule.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : 'Not scheduled'}
              </strong>
            </span>
          </span>
        </div>
        <div>
          <small>Current Status</small>
          <span className={`delivery-status-pill ${tone}`}>
            <i />
            {status}
          </span>
        </div>
      </div>

      {farmerRequest && (
        <div className="assign-rider-farmer-callout" role="region" aria-label="Farmer candidate reservation">
          <div className="assign-rider-farmer-callout-content">
            <span className="assign-rider-farmer-callout-icon" aria-hidden="true">🌾</span>
            <div className="assign-rider-farmer-callout-text">
              <h4>Farmer-Requested Candidate</h4>
              <p>
                Farmer <strong>{farmerRequest.farmer_name}</strong> ({farmerRequest.farm_name || 'Farm'}) invited{' '}
                <strong>{farmerRequest.rider_name}</strong> for pickup on{' '}
                <strong>
                  {new Date(farmerRequest.requested_schedule).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </strong>
                {farmerRequest.proposed_delivery_fee !== null &&
                  ` (Proposed Fee: ₱${Number(farmerRequest.proposed_delivery_fee).toFixed(2)})`}
                {' '}— Status: <span className={`farmer-req-status-pill ${farmerRequest.status}`}>{farmerRequest.status}</span>
              </p>
              {selectedRiderId && selectedRiderId !== farmerRequest.rider_id && farmerRequest.status === 'pending' && (
                <div className="assign-rider-farmer-warning">
                  <Icon name="alert" size={14} />
                  <span>Assigning a different rider will supersede the farmer's pending request for {farmerRequest.rider_name}.</span>
                </div>
              )}
            </div>
          </div>
          {selectedRiderId !== farmerRequest.rider_id && (
            <button
              type="button"
              className="assign-rider-farmer-select-btn"
              onClick={() => onSelect(farmerRequest.rider_id)}
              disabled={saving}
            >
              Select Farmer's Choice
            </button>
          )}
        </div>
      )}

      <div className="assign-rider-list-heading">
        <h3>Select a Rider</h3>
        <label>
          <span className="sr-only">Search riders</span>
          <Icon name="search" size={20} />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search riders..."
          />
        </label>
      </div>
      <div className="assign-rider-list" role="radiogroup" aria-label="Available riders">
        {visible.map((rider) => {
          const isFarmerCandidate = farmerRequest?.rider_id === rider.rider_id
          const state = rider.availability_status.toLowerCase()
          const available =
            ['online', 'available'].includes(state) &&
            rider.active_deliveries < rider.maximum_active_deliveries
          const busy =
            ['busy', 'on_delivery'].includes(state) ||
            rider.active_deliveries >= rider.maximum_active_deliveries
          const disabled = !available && !busy
          return (
            <label
              className={`assign-rider-option ${selectedRiderId === rider.rider_id ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${isFarmerCandidate ? 'farmer-candidate' : ''}`}
              key={rider.rider_id}
            >
              <input
                type="radio"
                name="assigned-rider"
                value={rider.rider_id}
                checked={selectedRiderId === rider.rider_id}
                disabled={disabled || saving}
                onChange={() => onSelect(rider.rider_id)}
              />
              <span className="assign-rider-avatar">
                <Icon name="profile" size={24} />
              </span>
              <span className="assign-rider-name">
                <strong>
                  {rider.full_name}
                  {isFarmerCandidate && (
                    <span className="assign-rider-farmer-badge">🌾 Farmer's Choice</span>
                  )}
                </strong>
                <small className={available ? 'available' : busy ? 'busy' : 'offline'}>
                  <i />
                  {available ? 'Available' : busy ? 'Busy' : 'Offline'}
                </small>
              </span>
              <span
                className={`assign-rider-workload ${available ? 'idle' : busy ? 'busy' : 'offline'}`}
              >
                {available ? 'Idle' : busy ? 'On Delivery' : 'Offline'}
              </span>
            </label>
          )
        })}
        {!visible.length && <p className="assign-rider-empty">No matching riders.</p>}
      </div>
      {error && (
        <p className="assign-rider-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button type="button" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          className="confirm"
          type="button"
          onClick={onConfirm}
          disabled={saving || !selectedRiderId}
        >
          {saving ? 'Assigning…' : 'Assign Rider'}
        </button>
      </footer>
    </section>
  )
}
