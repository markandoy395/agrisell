import { useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { Delivery } from '../../types/delivery'
import { label } from '../../utils/delivery'

type Props = {
  delivery: Delivery
  saving: boolean
  error: string
  onClose: () => void
  onSave: (values: {
    pickup: string
    destination: string
    schedule: string
    notes: string
  }) => void
}
const toLocalDateTime = (value: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function EditDeliveryModal({ delivery, saving, error, onClose, onSave }: Props) {
  const initial = toLocalDateTime(delivery.estimated_delivery_time)
  const [pickup, setPickup] = useState(delivery.pickup_location || '')
  const [destination, setDestination] = useState(delivery.dropoff_location || '')
  const [scheduleDate, setScheduleDate] = useState(initial.slice(0, 10))
  const [scheduleTime, setScheduleTime] = useState(initial.slice(11, 16))
  const [notes, setNotes] = useState('')
  return (
    <form
      className="edit-delivery-modal"
      onSubmit={(event) => {
        event.preventDefault()
        onSave({
          pickup,
          destination,
          schedule: scheduleDate && scheduleTime ? `${scheduleDate}T${scheduleTime}` : '',
          notes,
        })
      }}
    >
      <button
        className="edit-delivery-close"
        type="button"
        onClick={onClose}
        disabled={saving}
        aria-label="Close edit delivery"
      >
        <Icon name="close" size={22} />
      </button>
      <header>
        <h2>Edit Delivery</h2>
        <p>Update the delivery details and save your changes.</p>
      </header>
      <div className="edit-delivery-grid">
        <label>
          <span>Order ID</span>
          <input value={`ORD-${delivery.order_id}`} disabled />
        </label>
        <label>
          <span>Goods</span>
          <span className="edit-delivery-input">
            <Icon name="basket" size={19} />
            <input value={`${delivery.total_weight_kg?.toFixed(3) ?? '0.000'} kg Goods`} disabled />
          </span>
        </label>
        <label>
          <span>Pickup Location</span>
          <span className="edit-delivery-input">
            <Icon name="route" size={19} />
            <input
              value={pickup}
              onChange={(event) => setPickup(event.target.value)}
              required
              disabled={saving}
            />
          </span>
        </label>
        <label>
          <span>Destination</span>
          <span className="edit-delivery-input">
            <Icon name="route" size={19} />
            <input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              required
              disabled={saving}
            />
          </span>
        </label>
        <label>
          <span>Schedule Date</span>
          <span className="edit-delivery-input">
            <Icon name="calendar" size={19} />
            <input
              type="date"
              value={scheduleDate}
              onChange={(event) => setScheduleDate(event.target.value)}
              required
              disabled={saving}
            />
          </span>
        </label>
        <label>
          <span>Schedule Time</span>
          <span className="edit-delivery-input">
            <Icon name="alert" size={19} />
            <input
              type="time"
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
              required
              disabled={saving}
            />
          </span>
        </label>
        <label>
          <span>Assigned Rider</span>
          <span className="edit-delivery-input">
            <Icon name="profile" size={19} />
            <input value={delivery.rider_name || 'Unassigned'} disabled />
          </span>
        </label>
        <label>
          <span>Proposed Fee</span>
          <span className="edit-delivery-input">
            <b>₱</b>
            <input value="0.00" disabled />
          </span>
        </label>
        <label>
          <span>Status</span>
          <span className="edit-delivery-input edit-delivery-status">
            <i />
            <input value={label(delivery.delivery_status)} disabled />
          </span>
        </label>
      </div>
      <label className="edit-delivery-notes">
        <span>
          <Icon name="document" size={18} />
          Notes (Optional)
        </span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add notes about this delivery..."
          maxLength={1000}
          disabled={saving}
        />
      </label>
      {error && (
        <p className="edit-delivery-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button type="button" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="confirm" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </footer>
    </form>
  )
}
