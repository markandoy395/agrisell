import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchOrderDetail, saveOrderAction } from '../../api/orders'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { OrderDetail, OrderRow } from '../../types/dashboard'
import { isOverdue } from '../../utils/delivery'
import { getOrderStatusLabel } from '../../utils/orderWorkspace'
import { CloseButton } from '../../components/ui/closeButton/CloseButton'
import { Icon } from '../../components/ui/icon/Icon'

type Props = {
  order: OrderRow
  onClose: () => void
  onSaved: () => Promise<void>
  onManageDelivery: (deliveryId: number) => void
}
type Action = 'status' | 'review_cancellation' | 'refund' | 'resolve_exception'

const nextStatuses = (status: string, deliveryStatus?: string) => {
  const value = status.toLowerCase()
  const deliveryComplete = ['completed', 'delivered'].includes((deliveryStatus ?? '').toLowerCase())
  if (['pending', 'placed', 'topay'].includes(value)) return ['toShip', 'cancelled']
  if (['toship', 'to_ship'].includes(value)) return ['preparing', 'cancelled']
  if (value === 'preparing') return ['readyForPickup', 'cancelled']
  if (value === 'readyforpickup') return [...(deliveryComplete ? ['delivered'] : []), 'cancelled']
  if (value === 'shipping') return deliveryComplete ? ['delivered'] : []
  return []
}
const formatDateTime = (value: unknown) => {
  const date = new Date(typeof value === 'string' ? value : '')
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0)
const readablePaymentValue = (payment: Record<string, unknown> | null, key: string) => {
  const value = payment?.[key]
  return typeof value === 'string' && value.trim() ? value : 'Not recorded'
}

const printWaybill = (detail: OrderDetail) => {
  if (!detail.delivery) return
  const escape = (value: unknown) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  const popup = window.open('', '_blank')
  if (!popup) return
  popup.opener = null
  popup.document.write(`<!doctype html><html><head><title>Waybill ORD-${escape(detail.order.order_id)}</title><style>
    body{font:14px Arial,sans-serif;margin:32px;color:#17231b}h1{margin:0 0 4px}.id{font-size:22px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:28px}.box{border:1px solid #b8c4ba;border-radius:8px;padding:16px}.wide{grid-column:1/-1}.box strong{display:block;font-size:11px;text-transform:uppercase;color:#607064;margin-bottom:6px}@media print{body{margin:12mm}}
    </style></head><body><h1>AgriSell Delivery Waybill</h1><div class="id">ORD-${escape(detail.order.order_id)}</div><div class="grid">
    <div class="box"><strong>Customer</strong>${escape(detail.order.buyer_name || 'Not recorded')}<br>${escape(detail.order.contact_number || '')}</div>
    <div class="box"><strong>Courier</strong>${escape(detail.delivery.rider_name || 'Unassigned')}<br>${escape(detail.delivery.rider_phone || '')}</div>
    <div class="box wide"><strong>Pickup</strong>${escape(detail.delivery.pickup_location || 'Not set')}<br>${escape(detail.delivery.pickup_contact || '')}</div>
    <div class="box wide"><strong>Destination</strong>${escape(detail.delivery.dropoff_location || detail.order.delivery_address || 'Not set')}<br>${escape(detail.delivery.dropoff_contact || detail.order.contact_number || '')}</div>
    <div class="box"><strong>Schedule</strong>${escape(formatDateTime(detail.delivery.estimated_delivery_time))}</div>
    <div class="box"><strong>Total</strong>${escape(formatMoney(detail.order.total_amount))}</div>
    </div><script>window.addEventListener('load',()=>{window.print();window.close()})</script></body></html>`)
  popup.document.close()
}

export function OrderManagementPanel({ order, onClose, onSaved, onManageDelivery }: Props) {
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState<Action | ''>('')
  const [status, setStatus] = useState('')
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchOrderDetail(order.id, controller.signal)
      .then(setDetail)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(getApiErrorMessage(cause, 'The order details could not be loaded.'))
      })
    return () => controller.abort()
  }, [order.id])

  const statuses = useMemo(
    () => nextStatuses(detail?.order.order_status ?? '', detail?.delivery?.delivery_status),
    [detail?.order.order_status, detail?.delivery?.delivery_status],
  )
  const cancelled = ['cancelled', 'canceled'].includes(
    (detail?.order.order_status ?? '').toLowerCase(),
  )
  const refundRequired = (detail?.order.payment_status ?? '').toLowerCase() === 'refund_required'
  const hasException = detail?.case.exception_status === 'open'
  const deliveryOverdue = detail?.delivery ? isOverdue(detail.delivery, now) : false
  const deliverySuccessful = ['completed', 'delivered'].includes(
    (detail?.delivery?.delivery_status ?? '').toLowerCase(),
  )
  const items = Array.isArray(detail?.items) ? detail.items : []
  const recordedFailureReason = detail
    ? detail.history[0]?.reason || readablePaymentValue(detail.payment, 'failure_reason')
    : 'Not recorded'
  const selectedAction: Action =
    action ||
    (statuses.length
      ? 'status'
      : cancelled
        ? 'review_cancellation'
        : refundRequired
          ? 'refund'
          : 'resolve_exception')
  const selectedStatus = status || statuses[0] || ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!detail || !reason.trim()) return
    setSaving(true)
    setError('')
    try {
      const updated = await saveOrderAction({
        action: selectedAction,
        command_id: crypto.randomUUID(),
        order_id: detail.order.order_id,
        previous_status: detail.order.order_status,
        reason: reason.trim(),
        ...(selectedAction === 'status' ? { status: selectedStatus } : {}),
        ...(selectedAction === 'review_cancellation' ? { decision } : {}),
        ...(selectedAction === 'refund' ? { reference: reference.trim() } : {}),
      })
      setDetail(updated)
      setReason('')
      setReference('')
      await onSaved()
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'The order action could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="order-panel-backdrop" onMouseDown={onClose}>
      <aside
        className="order-management-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-management-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CloseButton label="Close order management" onClick={onClose} />
        <header className="order-panel-header">
          <span className="modal-eyebrow">ORDER MANAGEMENT</span>
          <h2 id="order-management-title">Order {order.id}</h2>
          <p>
            {order.customer} · {order.item}
          </p>
        </header>
        {!detail && !error && <div className="order-panel-state">Loading order record…</div>}
        {error && (
          <div className="order-panel-error" role="alert">
            {error}
          </div>
        )}
        {detail && (
          <>
            <div className="order-detail-grid">
              <div>
                <span>Tracking number</span>
                <strong>ORD-{detail.order.order_id}</strong>
              </div>
              <div>
                <span>Customer</span>
                <strong>{detail.order.buyer_name || order.customer || 'Not recorded'}</strong>
                <small>{detail.order.contact_number || 'No contact number'}</small>
              </div>
              <div>
                <span>Order status</span>
                <strong className={deliveryOverdue ? 'is-overdue' : undefined}>
                  {deliveryOverdue ? 'Overdue' : getOrderStatusLabel(detail.order.order_status)}
                </strong>
              </div>
              <div>
                <span>Payment status</span>
                <strong>{getOrderStatusLabel(detail.order.payment_status)}</strong>
              </div>
              <div>
                <span>Payment method</span>
                <strong>{getOrderStatusLabel(detail.order.payment_method)}</strong>
                <small>
                  Ref: {readablePaymentValue(detail.payment, 'transaction_reference')}
                </small>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatMoney(detail.order.total_amount)}</strong>
              </div>
              <div>
                <span>Delivery</span>
                <strong className={deliveryOverdue ? 'is-overdue' : undefined}>
                  {detail.delivery
                    ? deliveryOverdue
                      ? 'Overdue'
                      : getOrderStatusLabel(detail.delivery.delivery_status)
                    : 'Not created'}
                </strong>
              </div>
              <div>
                <span>Order date</span>
                <strong>{formatDateTime(detail.order.order_date || detail.order.created_at)}</strong>
              </div>
              <div className="order-detail-wide">
                <span>Delivery address</span>
                <strong>{detail.order.delivery_address || 'Not recorded'}</strong>
              </div>
            </div>

            <section className="order-information-section">
              <h3>Order items</h3>
              {items.length ? (
                <div className="order-item-list">
                  {items.map((item) => (
                    <div key={item.commodity_id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>Quantity: {item.quantity}</small>
                      </span>
                      <strong>{formatMoney(item.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="order-information-empty">No item details were recorded.</p>
              )}
            </section>

            <section className="order-information-section">
              <div className="order-section-heading">
                <div>
                  <h3>Delivery and courier</h3>
                  <p>Logistics actions remain in the dedicated delivery workflow.</p>
                </div>
                {detail.delivery && (
                  <button
                    className="order-manage-delivery"
                    type="button"
                    onClick={() => onManageDelivery(detail.delivery!.delivery_id)}
                  >
                    <Icon name="truck" size={16} />
                    Manage delivery
                  </button>
                )}
              </div>
              {detail.delivery ? (
                <dl className="order-logistics-grid">
                  <div>
                    <dt>Courier</dt>
                    <dd>{detail.delivery.rider_name || 'Unassigned'}</dd>
                    <small>{detail.delivery.rider_phone || 'No courier contact'}</small>
                  </div>
                  <div>
                    <dt>Schedule</dt>
                    <dd>{formatDateTime(detail.delivery.estimated_delivery_time)}</dd>
                  </div>
                  <div>
                    <dt>Pickup</dt>
                    <dd>{detail.delivery.pickup_location || 'Not recorded'}</dd>
                    <small>{detail.delivery.pickup_contact || ''}</small>
                  </div>
                  <div>
                    <dt>Destination</dt>
                    <dd>
                      {detail.delivery.dropoff_location ||
                        detail.order.delivery_address ||
                        'Not recorded'}
                    </dd>
                    <small>{detail.delivery.dropoff_contact || detail.order.contact_number || ''}</small>
                  </div>
                </dl>
              ) : (
                <p className="order-information-empty">
                  No delivery has been created for this order.
                </p>
              )}
              {detail.delivery && deliverySuccessful && (
                <button
                  className="order-print-waybill"
                  type="button"
                  onClick={() => printWaybill(detail)}
                >
                  <Icon name="printer" size={16} />
                  Print waybill
                </button>
              )}
            </section>

            {cancelled && (
              <section className="order-case-card">
                <div>
                  <Icon name="alert" size={17} />
                  <strong>Cancellation review</strong>
                </div>
                <p>{detail.order.cancellation_reason || 'No cancellation reason was recorded.'}</p>
                <small>
                  {detail.case.cancellation_decision
                    ? `Reviewed: ${getOrderStatusLabel(detail.case.cancellation_decision)}`
                    : 'Awaiting administrator review'}
                </small>
              </section>
            )}
            {detail.case.dispute_status && (
              <section
                className={`order-case-card ${detail.case.dispute_status === 'pending' ? 'is-exception' : ''}`}
              >
                <div>
                  <Icon name="alert" size={17} />
                  <strong>
                    Buyer goods dispute ({detail.case.dispute_status === 'pending' ? 'Under review' : 'Resolved'})
                  </strong>
                </div>
                <p>
                  <strong>Category: </strong>
                  <span style={{ textTransform: 'capitalize' }}>
                    {detail.case.dispute_category?.replaceAll('_', ' ') || 'Damaged / rotten produce'}
                  </span>
                  <br />
                  <strong>Requested resolution: </strong>
                  <span style={{ textTransform: 'capitalize' }}>
                    {detail.case.dispute_requested_resolution?.replaceAll('_', ' ') || 'Full refund'}
                  </span>
                  <br />
                  <strong>Buyer claim: </strong>
                  {detail.case.dispute_reason || 'No details recorded'}
                </p>
                {detail.case.dispute_submitted_at && (
                  <small>Submitted: {formatDateTime(detail.case.dispute_submitted_at)}</small>
                )}
                {detail.case.dispute_resolution_note && (
                  <p style={{ marginTop: 8 }}>
                    <strong>Resolution note: </strong>
                    {detail.case.dispute_resolution_note}
                  </p>
                )}
              </section>
            )}
            {hasException && (
              <section className="order-case-card is-exception">
                <div>
                  <Icon name="alert" size={17} />
                  <strong>Open exception</strong>
                </div>
                <p>
                  {detail.case.dispute_status === 'pending'
                    ? `Buyer has opened a formal goods dispute requiring review and resolution. Claim: ${detail.case.dispute_reason || recordedFailureReason}`
                    : refundRequired
                      ? `A verified payment must be refunded. Reason: ${recordedFailureReason}`
                      : `This order has a workflow exception that needs an administrator resolution. Reason: ${recordedFailureReason}`}
                </p>
              </section>
            )}

            <section className="order-action-section">
              <h3>Order actions</h3>
              {(statuses.length > 0 || cancelled || refundRequired || hasException) ? (
                <form onSubmit={submit}>
                <label>
                  Action
                  <select
                    value={selectedAction}
                    onChange={(event) => setAction(event.target.value as Action)}
                    disabled={saving}
                  >
                    {statuses.length > 0 && <option value="status">Update order status</option>}
                    {cancelled && <option value="review_cancellation">Review cancellation</option>}
                    {refundRequired && <option value="refund">Complete refund</option>}
                    {hasException && <option value="resolve_exception">Resolve exception</option>}
                    {!statuses.length && !cancelled && !refundRequired && !hasException && (
                      <option value="resolve_exception">No action available</option>
                    )}
                  </select>
                </label>
                {selectedAction === 'status' && (
                  <label>
                    New status
                    <select
                      value={selectedStatus}
                      onChange={(event) => setStatus(event.target.value)}
                      disabled={saving}
                    >
                      {statuses.map((value) => (
                        <option value={value} key={value}>
                          {getOrderStatusLabel(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {selectedAction === 'review_cancellation' && (
                  <label>
                    Decision
                    <select
                      value={decision}
                      onChange={(event) =>
                        setDecision(event.target.value as 'approved' | 'rejected')
                      }
                      disabled={saving}
                    >
                      <option value="approved">Approve cancellation record</option>
                      <option value="rejected">Flag cancellation as invalid</option>
                    </select>
                  </label>
                )}
                {selectedAction === 'refund' && (
                  <label>
                    Refund reference
                    <input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      maxLength={200}
                      required
                      placeholder="Transaction or refund reference"
                      disabled={saving}
                    />
                  </label>
                )}
                <label className="label-textarea">
                  Reason / resolution
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={1000}
                    required
                    rows={3}
                    placeholder="Record the evidence and reason for this action"
                    disabled={saving}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={
                    saving ||
                    (!hasException && selectedAction === 'resolve_exception') ||
                    (selectedAction === 'status' && !selectedStatus) ||
                    (selectedAction === 'refund' && !reference.trim())
                  }
                >
                  {saving ? 'Saving…' : 'Save audited action'}
                </button>
                </form>
              ) : (
                <p className="order-information-empty">
                  No order-level action is available for this status.
                </p>
              )}
            </section>

            <section className="order-timeline">
              <h3>Order history</h3>
              {detail.history.map((entry) => (
                <article key={entry.event_id}>
                  <i />
                  <div>
                    <strong>{getOrderStatusLabel(entry.event_type)}</strong>
                    <p>{entry.reason}</p>
                    <small>
                      {entry.actor} · {formatDateTime(entry.created_at)}
                    </small>
                  </div>
                </article>
              ))}
              {detail.order.cancelled_at && (
                <article>
                  <i />
                  <div>
                    <strong>Cancellation recorded</strong>
                    <p>{detail.order.cancellation_reason || 'No reason recorded'}</p>
                    <small>
                      {detail.order.cancelled_by_role || 'Unknown actor'} ·{' '}
                      {formatDateTime(detail.order.cancelled_at)}
                    </small>
                  </div>
                </article>
              )}
              <article>
                <i />
                <div>
                  <strong>Order created</strong>
                  <p>Order entered the marketplace workflow.</p>
                  <small>{formatDateTime(detail.order.created_at)}</small>
                </div>
              </article>
            </section>
          </>
        )}
      </aside>
    </div>
  )
}
