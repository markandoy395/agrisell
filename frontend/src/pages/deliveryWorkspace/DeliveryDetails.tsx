import { useEffect, useRef, useState } from 'react'
import { fetchDeliveryDetail, proofImageUrl, saveDelivery } from '../../api/deliveries'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { Delivery, DeliveryDetail, DeliveryOptions } from '../../types/delivery'
import { dateTime, isClosed, label, statusActions } from '../../utils/delivery'
import { DeliveryMap } from './DeliveryMap'

type Props = {
  delivery: Delivery
  riders: DeliveryOptions['riders']
  onClose: () => void
  onSaved: () => void
  onTrack: () => void
}
export function DeliveryDetails({ delivery, riders, onClose, onSaved, onTrack }: Props) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const [command, setCommand] = useState(() => crypto.randomUUID())
  const [point, setPoint] = useState(0)
  const [playing, setPlaying] = useState(false)
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    section.current?.focus()
    section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void fetchDeliveryDetail(delivery.delivery_id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setDetail(value)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(getApiErrorMessage(cause, 'Could not load delivery details.'))
      })
    return () => controller.abort()
  }, [delivery.delivery_id, reload])
  useEffect(() => {
    if (!playing || !detail?.history.length) return
    const timer = setInterval(
      () => setPoint((current) => (current + 1) % detail.history.length),
      800,
    )
    return () => clearInterval(timer)
  }, [detail, playing])
  const submit = async (body: Record<string, unknown>) => {
    setSaving(true)
    setError('')
    try {
      await saveDelivery({
        ...body,
        delivery_id: delivery.delivery_id,
        previous_status: delivery.delivery_status,
        previous_rider_id: delivery.rider_id,
        command_id: command,
      })
      onSaved()
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'Could not save the delivery.'))
    } finally {
      setSaving(false)
    }
  }
  const history = detail?.history ?? []
  const currentPoint = history[Math.min(point, Math.max(0, history.length - 1))]
  return (
    <section
      className="delivery-details"
      ref={section}
      tabIndex={-1}
      aria-label={`Delivery ${delivery.delivery_id} details`}
    >
      <div className="delivery-list-toolbar">
        <h2>Delivery {delivery.delivery_id} details</h2>
        <button type="button" disabled={saving} onClick={onClose}>
          Close details
        </button>
      </div>
      <dl className="delivery-detail-grid">
        <div>
          <dt>Customer / order</dt>
          <dd>
            {delivery.customer_name || 'Not recorded'} · #{delivery.order_id}
          </dd>
        </div>
        <div>
          <dt>Rider</dt>
          <dd>
            {delivery.rider_name || 'Unassigned'} {delivery.rider_phone}
          </dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>
            {delivery.pickup_location}
            <br />
            {delivery.pickup_contact}
          </dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>
            {delivery.dropoff_location}
            <br />
            {delivery.dropoff_contact}
          </dd>
        </div>
        <div>
          <dt>Scheduled arrival</dt>
          <dd>{dateTime(delivery.estimated_delivery_time)}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{dateTime(delivery.actual_delivery_time)}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="rider-tracking-error">
          {error}{' '}
          <button type="button" onClick={() => setReload((v) => v + 1)}>
            Reload details
          </button>
        </p>
      )}
      {!isClosed(delivery.delivery_status) && (
        <div className="delivery-detail-actions">
          {['pending', 'available', 'accepted', 'going_to_pickup', 'arrived_at_pickup'].includes(
            delivery.delivery_status,
          ) && (
            <form
              className="delivery-form"
              onChange={() => setCommand(crypto.randomUUID())}
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                void submit({ action: 'assign', rider_id: f.get('rider'), reason: f.get('reason') })
              }}
            >
              <h3>{delivery.rider_id ? 'Reassign rider' : 'Assign rider'}</h3>
              <label>
                Approved rider
                <select required name="rider" disabled={saving} defaultValue="">
                  <option value="">Choose rider</option>
                  {riders
                    .filter((r) => r.rider_id !== delivery.rider_id)
                    .map((r) => (
                      <option
                        key={r.rider_id}
                        value={r.rider_id}
                        disabled={
                          !['online', 'available', 'busy', 'on_delivery'].includes(
                            r.availability_status,
                          ) || r.active_deliveries >= r.maximum_active_deliveries
                        }
                      >
                        {r.full_name} · {r.vehicle_type} · {r.active_deliveries}/
                        {r.maximum_active_deliveries} · {r.availability_status}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Assignment reason
                <input
                  name="reason"
                  maxLength={1000}
                  required={!!delivery.rider_id}
                  disabled={saving}
                />
              </label>
              <button className="delivery-primary" disabled={saving}>
                Save assignment
              </button>
            </form>
          )}
          <form
            className="delivery-form"
            onChange={() => setCommand(crypto.randomUUID())}
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              void submit({ action: 'status', status: f.get('status'), reason: f.get('reason') })
            }}
          >
            <h3>Update status</h3>
            <p>
              Current: {label(delivery.delivery_status)}. Pickup and completion are confirmed in the
              rider app with the required evidence.
            </p>
            <label>
              Next status
              <select name="status" required disabled={saving}>
                <option value="">Choose status</option>
                {statusActions(delivery.delivery_status).map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <textarea name="reason" required maxLength={1000} disabled={saving} />
            </label>
            <button className="delivery-primary" disabled={saving}>
              Save status
            </button>
          </form>
        </div>
      )}
      {delivery.rider_id && !isClosed(delivery.delivery_status) && (
        <button type="button" onClick={onTrack}>
          Track rider
        </button>
      )}
      {!detail && !error && <p role="status">Loading details…</p>}
      {detail && (
        <>
          <h3>Order items</h3>
          {detail.items.length ? (
            <ul>
              {detail.items.map((item, index) => (
                <li key={index}>
                  {item.name} · {item.quantity} units · PHP {item.total.toFixed(2)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No item details recorded.</p>
          )}
          <h3>Delivery history</h3>
          {detail.events.length ? (
            <ol className="delivery-timeline">
              {detail.events.map((event) => (
                <li key={event.idempotency_key}>
                  <strong>{label(event.new_status)}</strong> · {dateTime(event.changed_at)}
                  <p>{event.remarks}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>No status history recorded.</p>
          )}
          <h3>Proof of delivery</h3>
          <div className="delivery-proofs">
            {detail.proofs.map((proof) => (
              <article key={proof.proof_id}>
                <strong>
                  {label(proof.proof_stage)} · {label(proof.proof_type)}
                </strong>
                <p>{dateTime(proof.created_at)}</p>
                {proof.signed_path && proofImageUrl(proof.signed_path) ? (
                  <a href={proofImageUrl(proof.signed_path)} target="_blank" rel="noreferrer">
                    <img
                      src={proofImageUrl(proof.signed_path)}
                      alt={`${label(proof.proof_stage)} evidence`}
                      onError={(e) => {
                        e.currentTarget.alt = 'Evidence link expired. Reload details to renew.'
                      }}
                    />
                  </a>
                ) : null}
                <p>{proof.remarks}</p>
                {proof.confirmed_at && <p>Recipient confirmed: {dateTime(proof.confirmed_at)}</p>}
                {proof.image_error && <p>{proof.image_error}</p>}
              </article>
            ))}
          </div>
          {!detail.proofs.length && <p>No delivery proof submitted yet.</p>}
          <h3>Trip playback</h3>
          {currentPoint ? (
            <>
              <div className="delivery-button-row">
                <button type="button" onClick={() => setPlaying(!playing)}>
                  {playing ? 'Pause playback' : 'Play trip'}
                </button>
                <label>
                  Recorded position
                  <input
                    type="range"
                    min={0}
                    max={history.length - 1}
                    value={point}
                    onChange={(e) => {
                      setPoint(Number(e.target.value))
                      setPlaying(false)
                    }}
                  />
                </label>
                <span>{dateTime(currentPoint.captured_at)}</span>
              </div>
              <DeliveryMap
                pins={[
                  {
                    id: 'playback',
                    name: 'Recorded rider position',
                    latitude: currentPoint.latitude,
                    longitude: currentPoint.longitude,
                    kind: 'history',
                  },
                ]}
                selectedPin="playback"
                follow
                line={history.slice(0, point + 1).map((p) => [p.longitude, p.latitude])}
              />
            </>
          ) : (
            <p>
              No trip positions recorded yet. New GPS updates are recorded while a delivery is
              active.
            </p>
          )}
        </>
      )}
    </section>
  )
}
