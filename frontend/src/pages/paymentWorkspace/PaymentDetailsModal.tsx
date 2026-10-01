import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/ui/icon/Icon'
import type { IconName, PaymentRecord } from '../../types/dashboard'
import { getPaymentInitials } from '../../utils/paymentWorkspace'

type PaymentDetailsModalProps = {
  payment: PaymentRecord
  onClose: () => void
}

type DetailSectionHeadingProps = {
  icon: IconName
  title: string
  description: string
}

const displayValue = (value?: string) => value?.trim() || 'Not recorded'

const formatPaymentDate = (value?: string) => {
  if (!value) return ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(timestamp))
    : value
}

function DetailSectionHeading({ icon, title, description }: DetailSectionHeadingProps) {
  return (
    <div className="payment-details-section-heading">
      <span className="payment-details-icon payment-details-section-icon">
        <Icon name={icon} size={23} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  )
}

export function PaymentDetailsModal({ payment, onClose }: PaymentDetailsModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const settlementReady = /ready|settled|complete/i.test(
    `${payment.settlement} ${payment.settlementStatus ?? ''}`,
  )
  const statusTone = payment.status.toLowerCase()
  const feeNotRecorded = /not recorded|not calculated/i.test(payment.fee)
  const note = feeNotRecorded ? 'Fee not recorded.' : `Processing fee: ${payment.fee}`
  const orderNumber = payment.order.replace(/^Order\s*/i, '')
  const orderDate = formatPaymentDate(payment.paidAt || payment.time)

  return createPortal(
    <div className="payment-details-overlay" role="presentation">
      <button
        className="payment-details-backdrop"
        type="button"
        aria-label="Close payment details"
        onClick={onClose}
      />
      <section
        className="payment-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-details-title"
      >
        <header className="payment-details-header">
          <span className="payment-details-icon payment-details-header-icon">
            <Icon name="document" size={28} />
          </span>
          <div className="payment-details-heading-copy">
            <h2 id="payment-details-title">Payment Details</h2>
            <p>View complete information about this payment record.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close payment details">
            <Icon name="close" size={22} />
          </button>
        </header>

        <div className="payment-details-content">
          <section className="payment-details-card">
            <DetailSectionHeading
              icon="document"
              title="Payment Information"
              description="Basic details about this payment transaction."
            />
            <dl className="payment-details-fields payment-details-fields-six">
              <div>
                <dt>Payment ID</dt>
                <dd>{payment.id}</dd>
              </div>
              <div>
                <dt>Order Number</dt>
                <dd>{orderNumber}</dd>
              </div>
              <div>
                <dt>Payment Method</dt>
                <dd className="payment-details-value-with-icon">
                  <span className="payment-details-mini-icon">
                    <Icon name="card" size={15} />
                  </span>
                  {displayValue(payment.method)}
                </dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{payment.amount}</dd>
              </div>
              <div>
                <dt>Net Amount</dt>
                <dd>{payment.net}</dd>
                <small>{feeNotRecorded ? 'Fee not recorded' : `Fee: ${payment.fee}`}</small>
              </div>
              <div>
                <dt>Payment Status</dt>
                <dd>
                  <span className={`payment-details-status ${statusTone}`}>
                    <i />
                    {payment.status}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="payment-details-card">
            <DetailSectionHeading
              icon="profile"
              title="Customer Information"
              description="Details about the customer who made this payment."
            />
            <dl className="payment-details-fields">
              <div>
                <dt>Customer Name</dt>
                <dd>{displayValue(payment.customer)}</dd>
              </div>
              <div>
                <dt>Customer ID</dt>
                <dd className="payment-details-value-with-icon payment-details-muted-value">
                  <span className="payment-details-avatar">
                    {getPaymentInitials(payment.customer)}
                  </span>
                  &mdash;
                </dd>
              </div>
              <div>
                <dt>Order Date</dt>
                <dd className="payment-details-value-with-icon">
                  <Icon name="calendar" size={18} />
                  {orderDate || 'Not recorded'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="payment-details-card">
            <DetailSectionHeading
              icon="coins"
              title="Settlement Details"
              description="Settlement and payout information for this payment."
            />
            <dl className="payment-details-fields">
              <div>
                <dt>Settlement Status</dt>
                <dd
                  className={`payment-details-value-with-icon ${
                    settlementReady ? 'payment-details-ready' : 'payment-details-confirming'
                  }`}
                >
                  <Icon name={settlementReady ? 'check' : 'calendar'} size={19} />
                  {displayValue(payment.settlement)}
                </dd>
              </div>
              <div>
                <dt>Settlement Date</dt>
                <dd className="payment-details-muted-value">
                  {payment.status === 'Completed' && payment.paidAt
                    ? formatPaymentDate(payment.paidAt)
                    : '—'}
                </dd>
                {payment.status !== 'Completed' && <small>Not yet settled</small>}
              </div>
              <div>
                <dt>Reference ID</dt>
                <dd className={!payment.transactionReference ? 'payment-details-muted-value' : ''}>
                  {payment.transactionReference || '—'}
                </dd>
                {!payment.transactionReference && <small>Not available</small>}
              </div>
            </dl>
          </section>

          <section className="payment-details-card payment-details-notes">
            <DetailSectionHeading
              icon="document"
              title="Notes"
              description="Additional information about this payment."
            />
            <p>
              <Icon name="info" size={17} />
              {note}
            </p>
          </section>
        </div>

        <footer className="payment-details-footer">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button className="payment-details-print" type="button" onClick={() => window.print()}>
            <Icon name="printer" size={18} />
            Print Receipt
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
