import { useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type {
  CommodityCreatePayload,
  FarmOption,
} from '../../types/commodityWorkspace'

type CommodityCreateDialogProps = {
  isOpen: boolean
  categories: string[]
  farms: FarmOption[]
  isCreating: boolean
  onClose: () => void
  onCreate: (payload: CommodityCreatePayload) => Promise<unknown>
}

const DEFAULT_CATEGORIES = [
  'Vegetables',
  'Fruits',
  'Grains',
  'Tubers & Roots',
  'Herbs & Spices',
  'Organic Produce',
]

const UNIT_TYPES = ['kg', 'bundle', 'sack', 'box', 'piece', 'gram']
const PRODUCTION_STAGES = [
  { label: 'Harvested', value: 'harvested' },
  { label: 'Harvesting Soon', value: 'harvesting_soon' },
  { label: 'Growing', value: 'growing' },
]
const AVAILABILITY_OPTIONS = [
  { label: 'Ready Now', value: 'ready_now' },
  { label: 'Pre-Order', value: 'pre_order' },
  { label: 'Not Accepting Orders', value: 'not_accepting_orders' },
]
const QUALITY_GRADES = ['Grade A', 'Grade B', 'Grade C', 'Standard', 'Premium']
const FRESHNESS_TYPES = [
  { label: 'Fresh Produce (Perishable)', value: 'fresh_produce' },
  { label: 'Packaged Food (Has Expiry)', value: 'packaged_food' },
  { label: 'Non-Perishable / Shelf-Stable', value: 'non_perishable' },
]

export function CommodityCreateDialog({
  isOpen,
  categories,
  farms,
  isCreating,
  onClose,
  onCreate,
}: CommodityCreateDialogProps) {
  const allCategories = Array.from(new Set([...categories, ...DEFAULT_CATEGORIES])).filter(Boolean)

  const [selectedFarmId, setSelectedFarmId] = useState(farms[0]?.farmId || '')
  const [name, setName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(allCategories[0] || 'Vegetables')
  const [customCategory, setCustomCategory] = useState('')
  const [isCustomCategory, setIsCustomCategory] = useState(false)
  const [unitType, setUnitType] = useState('kg')
  const [price, setPrice] = useState('')
  const [availableQuantity, setAvailableQuantity] = useState('50')
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState('1')
  const [gradeQuality, setGradeQuality] = useState('Grade A')
  const [productionStatus, setProductionStatus] = useState('harvested')
  const [availabilityStatus, setAvailabilityStatus] = useState('ready_now')
  const [isOrganic, setIsOrganic] = useState(false)
  const [status, setStatus] = useState<'available' | 'hidden'>('available')
  const [description, setDescription] = useState('')

  // Granular Agricultural Batch Data
  const [lotCode, setLotCode] = useState(() => {
    const d = new Date()
    const yr = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const dy = String(d.getDate()).padStart(2, '0')
    return `LOT-${yr}${mo}${dy}`
  })
  const [dateType, setDateType] = useState('fresh_produce')
  const [harvestedAt, setHarvestedAt] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [sellUntil, setSellUntil] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().split('T')[0]
  })
  const [storageInstructions, setStorageInstructions] = useState(
    'Keep stored in a cool, well-ventilated dry area away from direct sunlight.',
  )

  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCategorySelectChange = (value: string) => {
    if (value === '__custom__') {
      setIsCustomCategory(true)
      setSelectedCategory('__custom__')
    } else {
      setIsCustomCategory(false)
      setSelectedCategory(value)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const finalFarmId = selectedFarmId || farms[0]?.farmId
    if (!finalFarmId) {
      setError('Please select a target farm for this product.')
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Product name is required.')
      return
    }

    const parsedPrice = parseFloat(price)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Please provide a valid non-negative price per unit.')
      return
    }

    const parsedQty = parseFloat(availableQuantity)
    if (isNaN(parsedQty) || parsedQty < 0) {
      setError('Please provide a valid stock quantity.')
      return
    }

    const finalCategory = isCustomCategory ? customCategory.trim() : selectedCategory.trim()
    if (!finalCategory) {
      setError('Please select or specify a product category.')
      return
    }

    const parsedMoq = minimumOrderQuantity.trim() ? parseFloat(minimumOrderQuantity) : null

    try {
      await onCreate({
        availabilityStatus,
        availableQuantity: parsedQty,
        categoryName: finalCategory,
        dateType,
        description: description.trim(),
        expiresAt: expiresAt || null,
        farmId: finalFarmId,
        gradeQuality: gradeQuality || null,
        harvestDate: harvestedAt || null,
        harvestedAt: harvestedAt || null,
        isOrganic,
        lotCode: lotCode.trim() || null,
        minimumOrderQuantity: parsedMoq,
        name: trimmedName,
        price: parsedPrice,
        productionStatus,
        sellUntil: sellUntil || null,
        status,
        storageInstructions: storageInstructions.trim() || null,
        unitType,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product.')
    }
  }

  return (
    <div className="commodity-modal-backdrop" onClick={onClose}>
      <div
        className="commodity-modal-content commodity-modal-large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="commodity-modal-header">
          <div>
            <span className="commodity-modal-eyebrow">MARKETPLACE CATALOG</span>
            <h2 id="create-dialog-title">List New Commodity / Produce</h2>
          </div>
          <button
            type="button"
            className="commodity-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="commodity-create-form">
          {error && (
            <div className="commodity-form-error" role="alert">
              {error}
            </div>
          )}

          {/* Farm Selection */}
          <div className="commodity-form-section">
            <h3 className="commodity-section-title">1. Farm &amp; Origin Association</h3>
            <div className="commodity-form-field">
              <label htmlFor="create-farm-select">
                Target Farm &amp; Farmer <span className="required-star">*</span>
              </label>
              <select
                id="create-farm-select"
                value={selectedFarmId || (farms[0]?.farmId ?? '')}
                onChange={(e) => setSelectedFarmId(e.target.value)}
                disabled={isCreating}
                required
              >
                {farms.length === 0 && <option value="">No registered farms found</option>}
                {farms.map((f) => (
                  <option key={f.farmId} value={f.farmId}>
                    {f.farmName} — {f.farmerName} {f.location ? `(${f.location})` : ''}
                  </option>
                ))}
              </select>
              <small className="commodity-field-hint">
                Admin commodities are attributed to the designated registered farm in the producer
                network.
              </small>
            </div>
          </div>

          {/* Basic Information */}
          <div className="commodity-form-section">
            <h3 className="commodity-section-title">2. Product Classification &amp; Pricing</h3>
            <div className="commodity-form-row">
              <div className="commodity-form-field">
                <label htmlFor="create-product-name">
                  Product Name <span className="required-star">*</span>
                </label>
                <input
                  id="create-product-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fresh Highland Carrots, Sweet Yellow Corn"
                  disabled={isCreating}
                  required
                />
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-category-select">Category</label>
                <select
                  id="create-category-select"
                  value={selectedCategory}
                  onChange={(e) => handleCategorySelectChange(e.target.value)}
                  disabled={isCreating}
                >
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__">+ Custom category...</option>
                </select>
              </div>
            </div>

            {isCustomCategory && (
              <div className="commodity-form-field">
                <label htmlFor="create-custom-category">Custom Category Name</label>
                <input
                  id="create-custom-category"
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Organic Greens, Exotic Citrus"
                  disabled={isCreating}
                />
              </div>
            )}

            <div className="commodity-form-row commodity-form-row-3">
              <div className="commodity-form-field">
                <label htmlFor="create-product-price">
                  Price per Unit (₱) <span className="required-star">*</span>
                </label>
                <input
                  id="create-product-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  disabled={isCreating}
                  required
                />
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-unit-type">Unit Type</label>
                <select
                  id="create-unit-type"
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                  disabled={isCreating}
                >
                  {UNIT_TYPES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-stock-quantity">Initial Stock Quantity</label>
                <input
                  id="create-stock-quantity"
                  type="number"
                  step="0.1"
                  min="0"
                  value={availableQuantity}
                  onChange={(e) => setAvailableQuantity(e.target.value)}
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className="commodity-form-row commodity-form-row-3">
              <div className="commodity-form-field">
                <label htmlFor="create-moq">Minimum Order Quantity (MOQ)</label>
                <input
                  id="create-moq"
                  type="number"
                  step="1"
                  min="1"
                  value={minimumOrderQuantity}
                  onChange={(e) => setMinimumOrderQuantity(e.target.value)}
                  placeholder="1"
                  disabled={isCreating}
                />
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-grade-quality">Quality Grade</label>
                <select
                  id="create-grade-quality"
                  value={gradeQuality}
                  onChange={(e) => setGradeQuality(e.target.value)}
                  disabled={isCreating}
                >
                  {QUALITY_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-catalog-status">Catalog Visibility</label>
                <select
                  id="create-catalog-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'available' | 'hidden')}
                  disabled={isCreating}
                >
                  <option value="available">Available (Public)</option>
                  <option value="hidden">Hidden (Internal Only)</option>
                </select>
              </div>
            </div>

            <div className="commodity-form-row">
              <div className="commodity-form-field">
                <label htmlFor="create-stage">Production Stage</label>
                <select
                  id="create-stage"
                  value={productionStatus}
                  onChange={(e) => setProductionStatus(e.target.value)}
                  disabled={isCreating}
                >
                  {PRODUCTION_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-availability-status">Availability Status</label>
                <select
                  id="create-availability-status"
                  value={availabilityStatus}
                  onChange={(e) => setAvailabilityStatus(e.target.value)}
                  disabled={isCreating}
                >
                  {AVAILABILITY_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="commodity-checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={isOrganic}
                  onChange={(e) => setIsOrganic(e.target.checked)}
                  disabled={isCreating}
                />
                <span>Certified Organic Produce</span>
              </label>
            </div>
          </div>

          {/* Granular Agricultural Batch & Freshness Data */}
          <div className="commodity-form-section commodity-batch-section">
            <h3 className="commodity-section-title">
              3. Granular Agricultural Batch &amp; Freshness Data
            </h3>
            <p className="commodity-section-desc">
              Record specific harvest batch codes, shelf life bounds, and storage handling
              specifications for freshness traceability.
            </p>

            <div className="commodity-form-row">
              <div className="commodity-form-field">
                <label htmlFor="create-freshness-type">Produce Freshness Type</label>
                <select
                  id="create-freshness-type"
                  value={dateType}
                  onChange={(e) => setDateType(e.target.value)}
                  disabled={isCreating}
                >
                  {FRESHNESS_TYPES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-lot-code">Inventory Lot / Batch Code</label>
                <input
                  id="create-lot-code"
                  type="text"
                  maxLength={80}
                  value={lotCode}
                  onChange={(e) => setLotCode(e.target.value)}
                  placeholder="e.g. LOT-2026-001"
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className="commodity-form-row commodity-form-row-3">
              <div className="commodity-form-field">
                <label htmlFor="create-harvested-at">Harvest Date</label>
                <input
                  id="create-harvested-at"
                  type="date"
                  value={harvestedAt}
                  onChange={(e) => setHarvestedAt(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-sell-until">Marketable Until Date</label>
                <input
                  id="create-sell-until"
                  type="date"
                  value={sellUntil}
                  onChange={(e) => setSellUntil(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <div className="commodity-form-field">
                <label htmlFor="create-expires-at">Expiration Date</label>
                <input
                  id="create-expires-at"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className="commodity-form-field">
              <label htmlFor="create-storage-instructions">
                Storage &amp; Handling Instructions
              </label>
              <input
                id="create-storage-instructions"
                type="text"
                maxLength={240}
                value={storageInstructions}
                onChange={(e) => setStorageInstructions(e.target.value)}
                placeholder="e.g. Store at 2-5°C in clean crates, maintain 90% humidity"
                disabled={isCreating}
              />
            </div>
          </div>

          {/* Description */}
          <div className="commodity-form-section">
            <h3 className="commodity-section-title">4. Product Description</h3>
            <div className="commodity-form-field">
              <textarea
                id="create-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description of the produce, growing methods, quality traits..."
                disabled={isCreating}
              />
            </div>
          </div>

          <div className="commodity-modal-actions">
            <button
              type="button"
              className="commodity-secondary-button"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="commodity-primary-button"
              disabled={isCreating}
            >
              {isCreating ? 'Creating Product...' : 'Create & List Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
