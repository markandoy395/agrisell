import { useEffect, useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { CategoryStatus } from '../../types/categoryWorkspace'
import type { EditingCategoryState } from './useCategoriesData'

type CategoryEditDialogProps = {
  editingState: EditingCategoryState
  isSaving: boolean
  onClose: () => void
  onSave: (payload: {
    categoryName: string
    description: string
    status: CategoryStatus
  }) => Promise<void>
}

export function CategoryEditDialog({
  editingState,
  isSaving,
  onClose,
  onSave,
}: CategoryEditDialogProps) {
  const [categoryName, setCategoryName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<CategoryStatus>('active')
  const [validationError, setValidationError] = useState<string | null>(null)

  const isNew = editingState?.isNew ?? true
  const existing = editingState?.category

  useEffect(() => {
    if (existing) {
      setCategoryName(existing.categoryName || '')
      setDescription(existing.description || '')
      setStatus(existing.status || 'active')
    } else {
      setCategoryName('')
      setDescription('')
      setStatus('active')
    }
    setValidationError(null)
  }, [existing, isNew])

  if (!editingState) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = categoryName.trim()
    if (!trimmedName) {
      setValidationError('Category name is required.')
      return
    }

    try {
      setValidationError(null)
      await onSave({
        categoryName: trimmedName,
        description: description.trim(),
        status,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save category.'
      setValidationError(message)
    }
  }

  return (
    <div className="category-dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="category-dialog-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-dialog-title"
      >
        <div className="category-dialog-header">
          <div>
            <h3 id="category-dialog-title">
              {isNew ? 'Create Produce Category' : `Edit "${existing?.categoryName}"`}
            </h3>
            <p className="category-dialog-subtitle">
              {isNew
                ? 'Define a new produce category to organize marketplace discovery and product tagging.'
                : 'Update category naming, description, and listing status.'}
            </p>
          </div>
          <button
            type="button"
            className="category-dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="category-dialog-form">
          {validationError && (
            <div className="category-dialog-error" role="alert">
              {validationError}
            </div>
          )}

          <div className="category-form-group">
            <label htmlFor="category-name-input">
              Category Name <span className="category-required">*</span>
            </label>
            <input
              id="category-name-input"
              type="text"
              className="category-form-input"
              placeholder="e.g. Vegetables, Fruits, Grains, Root Crops"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              disabled={isSaving}
              autoFocus
            />
          </div>

          <div className="category-form-group">
            <label htmlFor="category-description-input">Description</label>
            <textarea
              id="category-description-input"
              className="category-form-textarea"
              placeholder="Brief description of produce types included in this category..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="category-form-group">
            <label>Marketplace Status</label>
            <div className="category-status-radios">
              <label className={`category-status-option ${status === 'active' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="category-status"
                  value="active"
                  checked={status === 'active'}
                  onChange={() => setStatus('active')}
                  disabled={isSaving}
                />
                <div>
                  <strong>Active</strong>
                  <small>Visible in marketplace filters and product tagging dropdowns</small>
                </div>
              </label>

              <label
                className={`category-status-option ${status === 'delisted' ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="category-status"
                  value="delisted"
                  checked={status === 'delisted'}
                  onChange={() => setStatus('delisted')}
                  disabled={isSaving}
                />
                <div>
                  <strong>Delisted</strong>
                  <small>Hidden from active marketplace discovery and new product tagging</small>
                </div>
              </label>
            </div>
          </div>

          <div className="category-dialog-actions">
            <button
              type="button"
              className="category-btn-cancel"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className="category-btn-submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : isNew ? 'Create Category' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
