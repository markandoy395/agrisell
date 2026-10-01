import { useState } from 'react'
import { saveDelivery } from '../../api/deliveries'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { DeliveryDataState } from './useDeliveryData'

type DeliveryCreateFormProps = {
  data: DeliveryDataState
  onClose: () => void
}

export function DeliveryCreateForm({ data, onClose }: DeliveryCreateFormProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [commandId, setCommandId] = useState(() => crypto.randomUUID())
  return (
    <form
      className="delivery-form"
      onSubmit={async (event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setSaving(true)
        setError('')
        try {
          await saveDelivery({
            action: 'create',
            command_id: commandId,
            order_id: String(form.get('order')),
            scheduled_at: new Date(String(form.get('schedule'))).toISOString(),
          })
          onClose()
          data.refresh()
        } catch (cause) {
          setError(getApiErrorMessage(cause, 'Could not create delivery.'))
        } finally {
          setSaving(false)
        }
      }}
      onChange={() => setCommandId(crypto.randomUUID())}
    >
      <h3>Create delivery from an order</h3>
      <p>
        Uses the order’s saved pickup and destination. Preparing orders will be marked ready for
        pickup.
      </p>
      <label>
        Order
        <select name="order" required disabled={saving}>
          <option value="">Choose an order</option>
          {data.options.orders.map((order) => (
            <option key={order.order_id} value={order.order_id}>
              #{order.order_id} — {order.customer_name || 'Customer'} — {order.destination}
            </option>
          ))}
        </select>
      </label>
      <label>
        Scheduled arrival
        <input name="schedule" type="datetime-local" required disabled={saving} />
      </label>
      {!data.options.orders.length && (
        <p>No preparing or ready orders without a delivery are available.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="delivery-button-row">
        <button className="delivery-primary" disabled={saving || !data.options.orders.length}>
          {saving ? 'Saving…' : 'Create delivery'}
        </button>
        <button type="button" disabled={saving} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
