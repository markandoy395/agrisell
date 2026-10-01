import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createManualOrder } from '../../api/orders'
import { fetchCommodities } from '../../api/adminCommodityApi'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { AdminCommodity } from '../../types/commodityWorkspace'
import type { UserWorkspaceRow } from '../../types/dashboard'
import { CloseButton } from '../../components/ui/closeButton/CloseButton'
import { Icon } from '../../components/ui/icon/Icon'
import './CreateManualOrderModal.css'

type Props = {
  isOpen: boolean
  onClose: () => void
  onOrderCreated: (orderId: number) => void
  users?: UserWorkspaceRow[]
}

const formatMoney = (val: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val || 0)

export function CreateManualOrderModal({ isOpen, onClose, onOrderCreated, users = [] }: Props) {
  const [customerType, setCustomerType] = useState<'existing' | 'walkin'>('existing')
  const [buyerSearch, setBuyerSearch] = useState('')
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')

  // Commodity Catalog & Selection
  const [commodities, setCommodities] = useState<AdminCommodity[]>([])
  const [loadingCommodities, setLoadingCommodities] = useState(false)
  const [selectedCommodityId, setSelectedCommodityId] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(1)

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'gcash'>('cash_on_delivery')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentVerified, setPaymentVerified] = useState(false)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Fetch available commodities
  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setLoadingCommodities(true)
    fetchCommodities(controller.signal)
      .then((res) => {
        const available = res.commodities.filter(
          (c) => c.status === 'available' && c.availableQuantity > 0,
        )
        setCommodities(available)
        if (available.length > 0 && !selectedCommodityId) {
          setSelectedCommodityId(available[0].commodityId)
          setQuantity(available[0].minimumOrderQuantity ?? 1)
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(err, 'Failed to load product catalog.'))
        }
      })
      .finally(() => setLoadingCommodities(false))

    return () => controller.abort()
  }, [isOpen])

  // Filter buyers
  const eligibleBuyers = useMemo(() => {
    return users.filter(
      (u) =>
        u.userType.toLowerCase() === 'buyer' ||
        (u.buyerUserId && u.buyerUserId.trim() !== ''),
    )
  }, [users])

  const filteredBuyers = useMemo(() => {
    if (!buyerSearch.trim()) return eligibleBuyers
    const q = buyerSearch.toLowerCase()
    return eligibleBuyers.filter(
      (b) =>
        `${b.firstName} ${b.lastName}`.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q) ||
        b.contactNumber.toLowerCase().includes(q) ||
        (b.businessName?.toLowerCase().includes(q) ?? false),
    )
  }, [eligibleBuyers, buyerSearch])

  // When selecting existing buyer, prefill contact and address if available
  const handleSelectBuyer = (buyerId: string) => {
    setSelectedBuyerId(buyerId)
    const buyer = eligibleBuyers.find((b) => b.buyerUserId === buyerId || b.userId === buyerId)
    if (buyer) {
      if (buyer.contactNumber && buyer.contactNumber !== 'Not provided') {
        setContactNumber(buyer.contactNumber)
      }
    }
  }

  // Selected commodity details
  const selectedCommodity = useMemo(() => {
    return commodities.find((c) => c.commodityId === selectedCommodityId)
  }, [commodities, selectedCommodityId])

  // Handle commodity change
  const handleCommodityChange = (commId: string) => {
    setSelectedCommodityId(commId)
    const comm = commodities.find((c) => c.commodityId === commId)
    if (comm) {
      const min = comm.minimumOrderQuantity ?? 1
      setQuantity(min)
    }
  }

  // Stepper handlers
  const minQty = selectedCommodity?.minimumOrderQuantity ?? 1
  const maxQty = selectedCommodity?.availableQuantity ?? 999
  const unitPrice = selectedCommodity?.price ?? 0
  const subtotal = unitPrice * quantity

  const handleStep = (delta: number) => {
    setQuantity((prev) => {
      const next = prev + delta
      if (next < minQty) return minQty
      if (next > maxQty) return maxQty
      return next
    })
  }

  // Keyboard close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !submitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, submitting, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (customerType === 'existing' && !selectedBuyerId) {
      setError('Please select an existing buyer from the list.')
      return
    }

    if (customerType === 'walkin' && !customerName.trim()) {
      setError('Customer name is required.')
      return
    }

    if (!contactNumber.trim()) {
      setError('A contact phone number is required.')
      return
    }

    if (!deliveryAddress.trim()) {
      setError('A delivery address is required.')
      return
    }

    if (!selectedCommodityId || !selectedCommodity) {
      setError('Please choose a product to order.')
      return
    }

    if (quantity < minQty) {
      setError(`Minimum order quantity is ${minQty} ${selectedCommodity.categoryName || 'units'}.`)
      return
    }

    if (quantity > maxQty) {
      setError(`Only ${maxQty} units are available in stock.`)
      return
    }

    if (paymentMethod === 'gcash' && !paymentReference.trim()) {
      setError('Please enter a GCash transaction reference number.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        buyer_user_id: customerType === 'existing' ? selectedBuyerId : undefined,
        customer_name: customerType === 'walkin' ? customerName.trim() : undefined,
        customer_email: customerType === 'walkin' && customerEmail.trim() ? customerEmail.trim() : undefined,
        contact_number: contactNumber.trim(),
        delivery_address: deliveryAddress.trim(),
        items: [
          {
            commodity_id: selectedCommodityId,
            quantity,
          },
        ],
        payment_method: paymentMethod,
        payment_reference: paymentMethod === 'gcash' ? paymentReference.trim() : undefined,
        payment_verified: paymentMethod === 'gcash' ? paymentVerified : undefined,
        notes: notes.trim() || undefined,
      }

      const result = await createManualOrder(payload)
      const newOrderId = Number(result?.order?.order_id)
      onOrderCreated(newOrderId)
      onClose()
    } catch (cause) {
      setError(getApiErrorMessage(cause, 'Failed to create manual order. Please check inputs.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="manual-order-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
      role="presentation"
    >
      <div
        className="manual-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-order-title"
      >
        <header className="manual-order-header">
          <div className="manual-order-header-title">
            <div className="manual-order-header-icon">
              <Icon name="cart" size={22} />
            </div>
            <div>
              <h2 id="manual-order-title">Create Manual / Phone Order</h2>
              <p>Place an order on behalf of a customer for phone or assisted sales.</p>
            </div>
          </div>
          <CloseButton label="Close" onClick={onClose} disabled={submitting} />
        </header>

        <form onSubmit={handleSubmit} className="manual-order-body">
          {error && (
            <div className="manual-order-alert error" role="alert">
              <Icon name="close" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selection Section */}
          <section className="manual-order-section">
            <div className="manual-order-section-title">
              <Icon name="users" size={16} />
              <span>Customer Information</span>
            </div>

            <div className="manual-order-type-toggle">
              <button
                type="button"
                className={`manual-order-type-btn ${customerType === 'existing' ? 'active' : ''}`}
                onClick={() => setCustomerType('existing')}
              >
                Existing Buyer
              </button>
              <button
                type="button"
                className={`manual-order-type-btn ${customerType === 'walkin' ? 'active' : ''}`}
                onClick={() => setCustomerType('walkin')}
              >
                Walk-in / Phone Customer
              </button>
            </div>

            {customerType === 'existing' ? (
              <div className="manual-order-form-grid single-col">
                <div className="manual-order-field">
                  <label className="manual-order-label" htmlFor="buyer-search">
                    Search &amp; Select Buyer
                  </label>
                  <input
                    id="buyer-search"
                    type="text"
                    className="manual-order-input"
                    placeholder="Search by name, email, or contact number..."
                    value={buyerSearch}
                    onChange={(e) => setBuyerSearch(e.target.value)}
                  />
                  <select
                    id="buyer-select"
                    className="manual-order-select"
                    value={selectedBuyerId}
                    onChange={(e) => handleSelectBuyer(e.target.value)}
                    required
                  >
                    <option value="">-- Choose a registered buyer ({filteredBuyers.length} available) --</option>
                    {filteredBuyers.map((b) => (
                      <option key={b.buyerUserId || b.userId} value={b.buyerUserId || b.userId}>
                        {b.firstName} {b.lastName} ({b.email}) - {b.contactNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="manual-order-form-grid">
                <div className="manual-order-field">
                  <label className="manual-order-label" htmlFor="walkin-name">
                    Full Name *
                  </label>
                  <input
                    id="walkin-name"
                    type="text"
                    className="manual-order-input"
                    placeholder="e.g. Maria Santos"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
                <div className="manual-order-field">
                  <label className="manual-order-label" htmlFor="walkin-email">
                    Email Address (Optional)
                  </label>
                  <input
                    id="walkin-email"
                    type="email"
                    className="manual-order-input"
                    placeholder="e.g. maria@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="manual-order-form-grid">
              <div className="manual-order-field">
                <label className="manual-order-label" htmlFor="manual-phone">
                  Contact Phone Number *
                </label>
                <input
                  id="manual-phone"
                  type="tel"
                  className="manual-order-input"
                  placeholder="e.g. 09171234567"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  required
                />
              </div>
              <div className="manual-order-field">
                <label className="manual-order-label" htmlFor="manual-address">
                  Delivery Address *
                </label>
                <textarea
                  id="manual-address"
                  className="manual-order-textarea"
                  placeholder="Complete street address, barangay, city, province"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  required
                />
              </div>
            </div>
          </section>

          {/* Product Selection Section */}
          <section className="manual-order-section">
            <div className="manual-order-section-title">
              <Icon name="tag" size={16} />
              <span>Product &amp; Quantity</span>
            </div>

            {loadingCommodities ? (
              <p style={{ fontSize: 'var(--fs-caption)', color: '#607064' }}>Loading available products catalog...</p>
            ) : commodities.length === 0 ? (
              <div className="manual-order-alert error">
                <span>No available products accepting orders in the catalog.</span>
              </div>
            ) : (
              <div className="manual-order-field">
                <label className="manual-order-label" htmlFor="commodity-select">
                  Choose Product *
                </label>
                <select
                  id="commodity-select"
                  className="manual-order-select"
                  value={selectedCommodityId}
                  onChange={(e) => handleCommodityChange(e.target.value)}
                  required
                >
                  {commodities.map((c) => (
                    <option key={c.commodityId} value={c.commodityId}>
                      {c.name} — {formatMoney(c.price)} / {c.categoryName || 'unit'} (Stock: {c.availableQuantity} | {c.farmName})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedCommodity && (
              <div className="manual-order-item-card">
                <div className="manual-order-item-top">
                  <div>
                    <strong>{selectedCommodity.name}</strong>
                    <div className="manual-order-item-meta">
                      <span>Farm: {selectedCommodity.farmName}</span>
                      <span>Farmer: {selectedCommodity.farmerName}</span>
                      <span>Available: {selectedCommodity.availableQuantity} units</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'var(--fs-small)', fontWeight: 'var(--fw-bold)', color: '#2d6a4f' }}>
                      {formatMoney(selectedCommodity.price)}
                    </div>
                    <span style={{ fontSize: 'var(--fs-xs)', color: '#607064' }}>per unit</span>
                  </div>
                </div>

                <div className="manual-order-qty-row">
                  <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-semibold)', color: '#314235' }}>Order Quantity:</span>
                  <div className="manual-order-stepper">
                    <button
                      type="button"
                      className="manual-order-step-btn"
                      onClick={() => handleStep(-1)}
                      disabled={quantity <= minQty}
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      className="manual-order-qty-input"
                      value={quantity}
                      min={minQty}
                      max={maxQty}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        if (val >= minQty && val <= maxQty) setQuantity(val)
                      }}
                    />
                    <button
                      type="button"
                      className="manual-order-step-btn"
                      onClick={() => handleStep(1)}
                      disabled={quantity >= maxQty}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Payment & Additional Details */}
          <section className="manual-order-section">
            <div className="manual-order-section-title">
              <Icon name="card" size={16} />
              <span>Payment &amp; Instructions</span>
            </div>

            <div className="manual-order-form-grid">
              <div className="manual-order-field">
                <label className="manual-order-label" htmlFor="manual-payment-method">
                  Payment Method *
                </label>
                <select
                  id="manual-payment-method"
                  className="manual-order-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'cash_on_delivery' | 'gcash')}
                >
                  <option value="cash_on_delivery">Cash on Delivery (COD)</option>
                  <option value="gcash">GCash</option>
                </select>
              </div>

              {paymentMethod === 'gcash' && (
                <div className="manual-order-field">
                  <label className="manual-order-label" htmlFor="gcash-ref">
                    GCash Reference No. *
                  </label>
                  <input
                    id="gcash-ref"
                    type="text"
                    className="manual-order-input"
                    placeholder="e.g. 100234567890"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    required
                  />
                  <label className="manual-order-checkbox-label">
                    <input
                      type="checkbox"
                      checked={paymentVerified}
                      onChange={(e) => setPaymentVerified(e.target.checked)}
                    />
                    <span>Mark payment as verified immediately</span>
                  </label>
                </div>
              )}

              <div className="manual-order-field full-width">
                <label className="manual-order-label" htmlFor="manual-notes">
                  Order Notes / Special Delivery Instructions
                </label>
                <textarea
                  id="manual-notes"
                  className="manual-order-textarea"
                  placeholder="e.g. Call before delivery, gate code, landmarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Summary Box */}
          <div className="manual-order-summary-box">
            <div className="manual-order-summary-row">
              <span>Items Total ({quantity} {quantity === 1 ? 'unit' : 'units'})</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="manual-order-summary-row">
              <span>Initial Order Status</span>
              <span style={{ fontWeight: 'var(--fw-semibold)', color: '#2d6a4f' }}>To Ship</span>
            </div>
            <div className="manual-order-summary-row total">
              <span>Total Payable</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
          </div>

          <footer className="manual-order-footer">
            <button
              type="button"
              className="manual-order-cancel-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="manual-order-submit-btn"
              disabled={submitting || !selectedCommodity}
            >
              <Icon name="check" size={16} />
              {submitting ? 'Placing Order...' : 'Place Manual Order'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
