import { useState, type ReactNode } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { Delivery } from '../../types/delivery'
import { isClosed, isOverdue, label } from '../../utils/delivery'

type Props = { delivery: Delivery; onClose: () => void; onEdit: () => void }

const LocationIcon = () => (
  <svg
    className="delivery-info-location-icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)
const InfoCard = ({
  title,
  icon,
  children,
  className = '',
}: {
  title: string
  icon: 'document' | 'profile' | 'calendar' | 'alert' | 'location'
  children: ReactNode
  className?: string
}) => (
  <section className={`delivery-info-card ${className}`}>
    <header>
      <span>{icon === 'location' ? <LocationIcon /> : <Icon name={icon} size={20} />}</span>
      <h3>{title}</h3>
    </header>
    {children}
  </section>
)
const Row = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="delivery-info-row">
    <dt>{name}</dt>
    <dd>{children || '—'}</dd>
  </div>
)

export function DeliveryInfoDetails({ delivery, onClose, onEdit }: Props) {
  const created = new Date(delivery.created_at)
  const scheduled = delivery.estimated_delivery_time
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
  return (
    <section className="delivery-info-modal">
      <button
        className="delivery-info-close-icon"
        type="button"
        onClick={onClose}
        aria-label="Close delivery details"
      >
        <Icon name="close" size={22} />
      </button>
      <header className="delivery-info-heading">
        <h2>View Delivery Details</h2>
        <p>Detailed information for order ORD-{delivery.order_id}</p>
      </header>
      <div className="delivery-info-grid">
        <InfoCard title="Order Information" icon="document">
          <dl>
            <Row name="Order ID">ORD-{delivery.order_id}</Row>
            <Row name="Order Type">Delivery</Row>
            <Row name="Date Created">
              {Number.isFinite(created.getTime()) ? created.toLocaleString() : '—'}
            </Row>
            <Row name="Customer">{delivery.customer_name || '—'}</Row>
          </dl>
        </InfoCard>
        <InfoCard title="Rider Information" icon="profile">
          <dl>
            <Row name="Rider Name">{delivery.rider_name || 'Unassigned'}</Row>
            <Row name="Contact Number">{delivery.rider_phone || '—'}</Row>
            <Row name="Rider ID">{delivery.rider_id || '—'}</Row>
          </dl>
        </InfoCard>
        <InfoCard title="Pickup" icon="location">
          <dl>
            <Row name="Location">{delivery.pickup_location || '—'}</Row>
            <Row name="Address">{delivery.pickup_location || '—'}</Row>
            <Row name="Contact Person">—</Row>
            <Row name="Contact Number">{delivery.pickup_contact || '—'}</Row>
          </dl>
        </InfoCard>
        <InfoCard title="Destination" icon="location">
          <dl>
            <Row name="Location">{delivery.dropoff_location || '—'}</Row>
            <Row name="Address">{delivery.dropoff_location || '—'}</Row>
            <Row name="Contact Person">—</Row>
            <Row name="Contact Number">{delivery.dropoff_contact || '—'}</Row>
          </dl>
        </InfoCard>
        <InfoCard title="Schedule" icon="calendar" className="compact">
          <dl>
            <Row name="Date">
              {scheduled && Number.isFinite(scheduled.getTime())
                ? scheduled.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
            </Row>
            <Row name="Time">
              {scheduled && Number.isFinite(scheduled.getTime())
                ? scheduled.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                : '—'}
            </Row>
          </dl>
        </InfoCard>
        <InfoCard title="Status" icon="alert" className="compact">
          <dl>
            <Row name="Current Status">
              <span className={`delivery-status-pill ${tone}`}>
                <i />
                {status}
              </span>
            </Row>
            <Row name="Last Updated">
              {Number.isFinite(created.getTime()) ? created.toLocaleString() : '—'}
            </Row>
          </dl>
        </InfoCard>
        <InfoCard title="Notes" icon="document" className="compact">
          <dl>
            <Row name="Notes">
              <span className="delivery-info-empty-note">No additional notes.</span>
            </Row>
          </dl>
        </InfoCard>
      </div>
      <footer>
        <button type="button" onClick={onClose}>
          Close
        </button>
        {!isClosed(delivery.delivery_status) && (
          <button className="edit" type="button" onClick={onEdit}>
            <Icon name="edit" size={18} />
            Edit Delivery
          </button>
        )}
      </footer>
    </section>
  )
}
