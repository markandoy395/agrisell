import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getVerificationDetail } from '../../api/adminData'
import { getApiErrorMessage } from '../../api/adminAuth'
import { fetchDeliveries, saveDelivery } from '../../api/deliveries'
import { Icon } from '../../components/ui/icon/Icon'
import type { Delivery } from '../../types/delivery'
import type { EntityRecord } from '../../types/dashboard'
import { canAssignDelivery } from '../../utils/delivery'
import { getRiderInitials } from './logisticsWorkspace.utils'
import './AssignDeliveryToRiderModal.css'

const orderLabel = (delivery: Delivery) =>
  `ORD-${delivery.order_id} · ${delivery.customer_name || 'Customer not recorded'}`

export function AssignDeliveryToRiderModal({
  rider,
  onClose,
  onAssigned,
}: {
  rider: EntityRecord
  onClose: () => void
  onAssigned?: (orderId: number) => Promise<void> | void
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [phone, setPhone] = useState(
    rider.secondary.includes('@') ? 'Not recorded' : rider.secondary,
  )
  const [email, setEmail] = useState(
    rider.secondary.includes('@') ? rider.secondary : 'Not recorded',
  )
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    fetchDeliveries(false, controller.signal)
      .then((rows) => {
        if (active)
          setDeliveries(
            rows.filter(
              (delivery) => !delivery.rider_id && canAssignDelivery(delivery.delivery_status),
            ),
          )
      })
      .catch((caught) => {
        if (active)
          setError(getApiErrorMessage(caught, 'Available deliveries could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    if (rider.entityId)
      getVerificationDetail('rider', rider.entityId)
        .then(({ profile }) => {
          if (!active) return
          if (typeof profile.email === 'string' && profile.email) setEmail(profile.email)
          if (typeof profile.contact_number === 'string' && profile.contact_number)
            setPhone(profile.contact_number)
        })
        .catch(() => undefined)
    return () => {
      active = false
      controller.abort()
    }
  }, [rider.entityId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, saving])

  const visible = useMemo(
    () =>
      deliveries.filter(
        (delivery) =>
          !query.trim() ||
          `${orderLabel(delivery)} ${delivery.pickup_location ?? ''} ${delivery.dropoff_location ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
      ),
    [deliveries, query],
  )
  const selected = deliveries.find((delivery) => delivery.delivery_id === selectedId)
  const vehicle = rider.value.split(' · ')[0] || 'Not recorded'
  const totalDeliveries = rider.value.match(/(\d+) deliveries?/)?.[1] ?? 'Not recorded'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !rider.entityId || saving) return
    setSaving(true)
    setError('')
    try {
      await saveDelivery({
        action: 'assign',
        delivery_id: selected.delivery_id,
        previous_status: selected.delivery_status,
        previous_rider_id: selected.rider_id,
        rider_id: rider.entityId,
        reason: note.trim() || undefined,
        command_id: crypto.randomUUID(),
      })
      await onAssigned?.(selected.order_id)
      onClose()
    } catch (caught) {
      setError(
        getApiErrorMessage(caught, 'This delivery could not be assigned. Refresh and try again.'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop rider-assignment-backdrop"
      onMouseDown={() => {
        if (!saving) onClose()
      }}
    >
      <section
        className="rider-assignment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-assignment-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rider-assignment-header">
          <div>
            <h2 id="rider-assignment-title">Assign Delivery</h2>
            <p>Select an existing order delivery and assign it to this rider.</p>
          </div>
          <button type="button" aria-label="Close assignment" onClick={onClose} disabled={saving}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="rider-assignment-summary">
          <span className="rider-assignment-avatar">{getRiderInitials(rider.primary)}</span>
          <div className="rider-assignment-identity">
            <strong>{rider.primary}</strong>
            <span>{rider.approvalStatus ?? 'Approved'} Rider</span>
            <small>
              <Icon name="mail" size={15} />
              {email}
            </small>
            <small>
              <Icon name="phone" size={15} />
              {phone}
            </small>
          </div>
          <div className="rider-assignment-meta">
            <span>
              <Icon name="truck" size={18} />
              {vehicle}
              <small>Vehicle Type</small>
            </span>
            <span>
              <Icon name="checkCircle" size={18} />
              {rider.status}
              <small>Availability</small>
            </span>
            <span>
              <Icon name="route" size={18} />
              {totalDeliveries} deliveries<small>Total Deliveries</small>
            </span>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          <label className="rider-assignment-label">
            1. Select Order <b>*</b>
          </label>
          <div className="rider-assignment-picker">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={query}
              onFocus={() => setListOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelectedId(null)
                setListOpen(true)
              }}
              placeholder={
                loading ? 'Loading available deliveries…' : 'Search and select an order…'
              }
              disabled={loading || saving}
              aria-label="Search orders with available deliveries"
            />
            <button
              type="button"
              aria-label="Show available orders"
              onClick={() => setListOpen(!listOpen)}
              disabled={loading || saving}
            >
              <Icon name="chevron" size={17} />
            </button>
            {listOpen && !loading && (
              <div
                className="rider-assignment-options"
                role="listbox"
                aria-label="Available orders"
              >
                {visible.length ? (
                  visible.map((delivery) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedId === delivery.delivery_id}
                      key={delivery.delivery_id}
                      onClick={() => {
                        setSelectedId(delivery.delivery_id)
                        setQuery(orderLabel(delivery))
                        setListOpen(false)
                      }}
                    >
                      <strong>ORD-{delivery.order_id}</strong>
                      <span>{delivery.customer_name || 'Customer not recorded'}</span>
                      <small>{delivery.dropoff_location || 'Destination not recorded'}</small>
                    </button>
                  ))
                ) : (
                  <p>No assignable deliveries match this search.</p>
                )}
              </div>
            )}
          </div>
          {!loading && !deliveries.length && (
            <p className="rider-assignment-empty">
              No unassigned deliveries are available. Create a delivery in Dispatch first.
            </p>
          )}
          <h3>2. Order Details</h3>
          <div className="rider-assignment-details">
            {selected ? (
              <>
                <div>
                  <Icon name="profile" size={18} />
                  <span>Customer Name</span>
                  <strong>{selected.customer_name || 'Not recorded'}</strong>
                </div>
                <div>
                  <Icon name="home" size={18} />
                  <span>Pickup Location</span>
                  <strong>{selected.pickup_location || 'Not recorded'}</strong>
                </div>
                <div>
                  <Icon name="route" size={18} />
                  <span>Drop-off Location</span>
                  <strong>{selected.dropoff_location || 'Not recorded'}</strong>
                </div>
                <div>
                  <Icon name="calendar" size={18} />
                  <span>Schedule</span>
                  <strong>
                    {selected.estimated_delivery_time
                      ? new Date(selected.estimated_delivery_time).toLocaleString('en-PH')
                      : 'Not scheduled'}
                  </strong>
                </div>
                <div>
                  <Icon name="info" size={18} />
                  <span>Delivery Status</span>
                  <strong>{selected.delivery_status.replaceAll('_', ' ')}</strong>
                </div>
              </>
            ) : (
              <p>Select an order to see its delivery details.</p>
            )}
          </div>
          <label className="rider-assignment-label" htmlFor="rider-assignment-note">
            3. Assignment Note (Optional)
          </label>
          <textarea
            id="rider-assignment-note"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add an admin note about this assignment…"
            rows={3}
            disabled={saving}
          />
          <span className="rider-assignment-count">{note.length}/500</span>
          <div className="rider-assignment-notice">
            <Icon name="info" size={19} />
            <div>
              <strong>Assignment update</strong>
              <p>
                The delivery will be assigned to this rider and their availability will change to
                Busy. The note is saved in admin delivery history.
              </p>
            </div>
          </div>
          {error && (
            <p className="rider-assignment-error" role="alert">
              {error}
            </p>
          )}
          <footer className="rider-assignment-footer">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={!selected || loading || saving}>
              <Icon name="route" size={17} />
              {saving ? 'Assigning…' : 'Assign Delivery'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
