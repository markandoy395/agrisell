import { useEffect, useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type {
  AdminCommodity,
  CommodityEditPayload,
} from '../../types/commodityWorkspace'

type CommodityEditDialogProps = {
  commodity: AdminCommodity | null
  categories: string[]
  isSaving: boolean
  onClose: () => void
  onSave: (commodityId: string, updates: CommodityEditPayload) => Promise<void>
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
const STATUS_OPTIONS = [
  { label: 'Available (Public)', value: 'available' },
  { label: 'Hidden (Moderated)', value: 'hidden' },
  { label: 'Delisted', value: 'delisted' },
]

export function CommodityEditDialog({
  commodity,
  categories,
  isSaving,
  onClose,
  onSave,
}: CommodityEditDialogProps) {
  const allCategories = Array.from(new Set([...categories, ...DEFAULT_CATEGORIES])).filter(Boolean)

  const [activeTab, setActiveTab] = useState<'basic' | 'batch'>('basic')
  const [name, setName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [isCustomCategory, setIsCustomCategory] = useState(false)
  const [unitType, setUnitType] = useState('kg')
  const [price, setPrice] = useState('')
  const [availableQuantity, setAvailableQuantity] = useState('')
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState('')
  const [gradeQuality, setGradeQuality] = useState('Grade A')
  const [productionStatus, setProductionStatus] = useState('harvested')
  const [availabilityStatus, setAvailabilityStatus] = useState('ready_now')
  const [isOrganic, setIsOrganic] = useState(false)
  const [status, setStatus] = useState('available')
  const [description, setDescription] = useState('')

  // Batch & Freshness Data
  const [batchId, setBatchId] = useState<string | undefined>(undefined)
  const [lotCode, setLotCode] = useState('')
  const [dateType, setDateType] = useState('fresh_produce')
  const [harvestedAt, setHarvestedAt] = useState('')
  const [sellUntil, setSellUntil] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [storageInstructions, setStorageInstructions] = useState('')

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (commodity) {
      setName(commodity.name || '')
      const existingInList = allCategories.includes(commodity.categoryName)
      if (existingInList) {
        setSelectedCategory(commodity.categoryName)
        setIsCustomCategory(false)
        setCustomCategory('')
      } else if (commodity.categoryName && commodity.categoryName !== 'Uncategorized') {
        setSelectedCategory('__custom__')
        setIsCustomCategory(true)
        setCustomCategory(commodity.categoryName)
      } else {
        setSelectedCategory(allCategories[0] || 'Vegetables')
        setIsCustomCategory(false)
        setCustomCategory('')
      }

      setUnitType(commodity.unitType || 'kg')
      setPrice(String(commodity.price ?? ''))
      setAvailableQuantity(String(commodity.availableQuantity ?? '0'))
      setMinimumOrderQuantity(
        commodity.minimumOrderQuantity != null ? String(commodity.minimumOrderQuantity) : '',
      )
      setGradeQuality(commodity.gradeQuality || 'Grade A')
      setProductionStatus(commodity.productionStatus || 'harvested')
      setAvailabilityStatus(commodity.availabilityStatus || 'ready_now')
      setIsOrganic(commodity.isOrganic === true)
      setStatus(commodity.status || 'available')
      setDescription(commodity.description || '')

      // Batch fields
      const primaryBatch = commodity.batches?.[0]
      if (primaryBatch) {
        setBatchId(primaryBatch.id)
        setLotCode(primaryBatch.lotCode || '')
        setDateType(primaryBatch.dateType || 'fresh_produce')
        setHarvestedAt(primaryBatch.harvestedAt || commodity.harvestDate || '')
        setSellUntil(primaryBatch.sellUntil || '')
        setExpiresAt(primaryBatch.expiresAt || '')
        setStorageInstructions(primaryBatch.storageInstructions || '')
      } else {
        setBatchId(undefined)
        setLotCode('')
        setDateType('fresh_produce')
        setHarvestedAt(commodity.harvestDate || '')
        setSellUntil('')
        setExpiresAt('')
        setStorageInstructions('')
      }

      setError(null)
      setActiveTab('basic')
    }
  }, [commodity, categories])

  if (!commodity) return null

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

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Product name cannot be blank.')
      return
    }

    const parsedPrice = parseFloat(price)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Please provide a valid non-negative price per unit.')
      return
    }

    const parsedQty = parseFloat(availableQuantity)
    if (isNaN(parsedQty) || parsedQty < 0) {
      setError('Please provide a valid available stock quantity.')
      return
    }

    const finalCategoryName = isCustomCategory ? customCategory.trim() : selectedCategory.trim()
    if (!finalCategoryName) {
      setError('Please specify a category for this product.')
      return
    }

    const parsedMoq = minimumOrderQuantity.trim() ? parseFloat(minimumOrderQuantity) : null

    try {
      await onSave(commodity.commodityId, {
        availabilityStatus,
        availableQuantity: parsedQty,
        batchId,
        categoryName: finalCategoryName,
        dateType,
        description: description.trim(),
        expiresAt: expiresAt || null,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product changes.')
    }
  }

  return (
    <div className="commodity-modal-backdrop" onClick={onClose}>
      <div
        className="commodity-modal-content commodity-modal-large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="commodity-modal-header">
          <div>
            <span className="commodity-modal-eyebrow">CATALOG MODERATION</span>
            <h2 id="edit-dialog-title">Edit Product: {commodity.name}</h2>
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

        {/* Origin summary context card */}
        <div className="commodity-context-panel" style={{ margin: '1rem 1.5rem 0' }}>
          <div className="commodity-context-item">
            <span>Farm &amp; Origin:</span>
            <strong>{commodity.farmName}</strong>
          </div>
          <div className="commodity-context-item">
            <span>Farmer:</span>
            <strong>{commodity.farmerName}</strong>
          </div>
          <div className="commodity-context-item">
            <span>Product ID:</span>
            <strong>#AG-C{commodity.commodityId}</strong>
          </div>
          <div className="commodity-context-item">
            <span>Location:</span>
            <strong>{commodity.farmLocation}</strong>
          </div>
        </div>

        {/* Tabs for Clean Separation */}
        <div className="commodity-dialog-tabs">
          <button
            type="button"
            className={`commodity-dialog-tab ${activeTab === 'basic' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            <Icon name="basket" size={15} />
            <span>Product &amp; Pricing</span>
          </button>
          <button
            type="button"
            className={`commodity-dialog-tab ${activeTab === 'batch' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            <Icon name="calendar" size={15} />
            <span>Agricultural Batch Data</span>
            {commodity.batches?.length > 0 && (
              <span className="commodity-tab-pill">{commodity.batches.length}</span>
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="commodity-edit-form">
          {error && (
            <div className="commodity-form-error" role="alert">
              {error}
            </div>
          )}

          {activeTab === 'basic' ? (
            <>
              <div className="commodity-form-row">
                <div className="commodity-form-field">
                  <label htmlFor="edit-product-name">
                    Product Name <span className="required-star">*</span>
                  </label>
                  <input
                    id="edit-product-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Product name"
                    disabled={isSaving}
                    required
                  />
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="commodity-category-select">Product Category</label>
                  <select
                    id="commodity-category-select"
                    value={selectedCategory}
                    onChange={(e) => handleCategorySelectChange(e.target.value)}
                    disabled={isSaving}
                  >
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">+ Enter custom category...</option>
                  </select>
                </div>
              </div>

              {isCustomCategory && (
                <div className="commodity-form-field">
                  <label htmlFor="commodity-custom-category">Custom Category Name</label>
                  <input
                    id="commodity-custom-category"
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="e.g. Organic Greens, Exotic Fruits"
                    disabled={isSaving}
                  />
                </div>
              )}

              <div className="commodity-form-row commodity-form-row-3">
                <div className="commodity-form-field">
                  <label htmlFor="edit-product-price">
                    Price per Unit (₱) <span className="required-star">*</span>
                  </label>
                  <input
                    id="edit-product-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={isSaving}
                    required
                  />
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-unit-type">Unit Type</label>
                  <select
                    id="edit-unit-type"
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                    disabled={isSaving}
                  >
                    {UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-available-stock">Available Stock Quantity</label>
                  <input
                    id="edit-available-stock"
                    type="number"
                    step="0.1"
                    min="0"
                    value={availableQuantity}
                    onChange={(e) => setAvailableQuantity(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="commodity-form-row commodity-form-row-3">
                <div className="commodity-form-field">
                  <label htmlFor="edit-moq">Minimum Order Quantity (MOQ)</label>
                  <input
                    id="edit-moq"
                    type="number"
                    step="1"
                    min="1"
                    value={minimumOrderQuantity}
                    onChange={(e) => setMinimumOrderQuantity(e.target.value)}
                    placeholder="None / 1"
                    disabled={isSaving}
                  />
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-grade-quality">Quality Grade</label>
                  <select
                    id="edit-grade-quality"
                    value={gradeQuality}
                    onChange={(e) => setGradeQuality(e.target.value)}
                    disabled={isSaving}
                  >
                    {QUALITY_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-catalog-status">Catalog Status</label>
                  <select
                    id="edit-catalog-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={isSaving}
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st.value} value={st.value}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="commodity-form-row">
                <div className="commodity-form-field">
                  <label htmlFor="edit-production-stage">Production Stage</label>
                  <select
                    id="edit-production-stage"
                    value={productionStatus}
                    onChange={(e) => setProductionStatus(e.target.value)}
                    disabled={isSaving}
                  >
                    {PRODUCTION_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-availability-status">Availability Status</label>
                  <select
                    id="edit-availability-status"
                    value={availabilityStatus}
                    onChange={(e) => setAvailabilityStatus(e.target.value)}
                    disabled={isSaving}
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
                    disabled={isSaving}
                  />
                  <span>Certified Organic Produce</span>
                </label>
              </div>

              <div className="commodity-form-field">
                <label htmlFor="commodity-description">Product Description</label>
                <textarea
                  id="commodity-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed description of the produce, growing methods, quality traits..."
                  disabled={isSaving}
                />
              </div>
            </>
          ) : (
            <div className="commodity-batch-panel">
              <div className="commodity-batch-banner">
                <Icon name="calendar" size={18} />
                <div>
                  <strong>Batch Traceability &amp; Freshness Tracking</strong>
                  <p>
                    Farmers and buyers rely on harvest dates, lot codes, and shelf-life constraints
                    to guarantee safe distribution.
                  </p>
                </div>
              </div>

              <div className="commodity-form-row">
                <div className="commodity-form-field">
                  <label htmlFor="edit-freshness-type">Produce Freshness Type</label>
                  <select
                    id="edit-freshness-type"
                    value={dateType}
                    onChange={(e) => setDateType(e.target.value)}
                    disabled={isSaving}
                  >
                    {FRESHNESS_TYPES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-lot-code">Inventory Lot / Batch Code</label>
                  <input
                    id="edit-lot-code"
                    type="text"
                    maxLength={80}
                    value={lotCode}
                    onChange={(e) => setLotCode(e.target.value)}
                    placeholder="e.g. LOT-2026-001"
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="commodity-form-row commodity-form-row-3">
                <div className="commodity-form-field">
                  <label htmlFor="edit-harvested-at">Harvest Date</label>
                  <input
                    id="edit-harvested-at"
                    type="date"
                    value={harvestedAt}
                    onChange={(e) => setHarvestedAt(e.target.value)}
                    disabled={isSaving}
                  />
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-sell-until">Marketable Until Date</label>
                  <input
                    id="edit-sell-until"
                    type="date"
                    value={sellUntil}
                    onChange={(e) => setSellUntil(e.target.value)}
                    disabled={isSaving}
                  />
                </div>

                <div className="commodity-form-field">
                  <label htmlFor="edit-expires-at">Expiration Date</label>
                  <input
                    id="edit-expires-at"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="commodity-form-field">
                <label htmlFor="edit-storage-instructions">Storage &amp; Handling Instructions</label>
                <input
                  id="edit-storage-instructions"
                  type="text"
                  maxLength={240}
                  value={storageInstructions}
                  onChange={(e) => setStorageInstructions(e.target.value)}
                  placeholder="e.g. Keep refrigerated at 4°C, away from high humidity"
                  disabled={isSaving}
                />
              </div>

              {commodity.batches?.length > 0 && (
                <div className="commodity-active-batches-card">
                  <h4>Recorded Agricultural Lots ({commodity.batches.length})</h4>
                  <div className="commodity-batch-list-display">
                    {commodity.batches.map((b) => (
                      <div
                        key={b.id}
                        className={`commodity-lot-item ${b.id === batchId ? 'is-selected' : ''}`}
                        onClick={() => {
                          setBatchId(b.id)
                          setLotCode(b.lotCode || '')
                          setDateType(b.dateType || 'fresh_produce')
                          setHarvestedAt(b.harvestedAt || '')
                          setSellUntil(b.sellUntil || '')
                          setExpiresAt(b.expiresAt || '')
                          setStorageInstructions(b.storageInstructions || '')
                        }}
                      >
                        <div className="commodity-lot-header">
                          <strong>{b.lotCode || 'Standard Lot'}</strong>
                          <span className="commodity-lot-qty">
                            {b.quantityRemaining}/{b.quantityReceived} {commodity.unitType}
                          </span>
                        </div>
                        <div className="commodity-lot-meta">
                          {b.harvestedAt && <span>Harvested: {b.harvestedAt}</span>}
                          {b.sellUntil && <span>Sell by: {b.sellUntil}</span>}
                          {b.expiresAt && <span>Exp: {b.expiresAt}</span>}
                        </div>
                        {b.storageInstructions && (
                          <small className="commodity-lot-storage">
                            Storage: {b.storageInstructions}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="commodity-modal-actions">
            <button
              type="button"
              className="commodity-secondary-button"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="commodity-primary-button"
              disabled={isSaving}
            >
              {isSaving ? 'Saving Changes...' : 'Save Product Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
