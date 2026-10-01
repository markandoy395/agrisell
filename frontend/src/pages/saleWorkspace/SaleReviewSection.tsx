import { Icon } from '../../components/ui/icon/Icon'
import type { SaleFormState } from './useSaleForm'
import { getDiscountLabel } from './saleWorkspace.utils'

export function SaleReviewSection({ form }: { form: SaleFormState }) {
  return (
    <section className="sale-review" aria-labelledby="sale-review-heading">
      <div className="sale-section-title">
        <span>3</span>
        <div>
          <h3 id="sale-review-heading">Review discount</h3>
          <p>Base prices remain unchanged after this promotion ends.</p>
        </div>
      </div>
      <div className="sale-review-grid">
        <div>
          <small>Promotion</small>
          <strong>{form.name || 'Untitled sale'}</strong>
        </div>
        <div>
          <small>Audience</small>
          <strong>{form.target === 'new_users_only' ? 'New users only' : 'All users'}</strong>
        </div>
        <div>
          <small>Discount</small>
          <strong>
            {form.value && form.discountValue > 0
              ? getDiscountLabel(form.type, form.discountValue)
              : 'Not set'}
          </strong>
        </div>
        <div>
          <small>Products</small>
          <strong>{form.selected.length} selected</strong>
        </div>
      </div>
      <label
        className={`sale-home-toggle ${form.promoteOnHome ? 'is-selected' : ''} ${form.selected.length < 2 ? 'is-disabled' : ''}`}
      >
        <input
          type="checkbox"
          checked={form.promoteOnHome}
          disabled={form.selected.length < 2}
          onChange={(event) => form.setPromoteOnHome(event.target.checked)}
        />
        <span className="sale-home-toggle-icon">
          <Icon name="trend" size={17} />
        </span>
        <span>
          <strong>Promote on Home</strong>
          <small>
            {form.selected.length < 2
              ? 'Select at least two products to create one campaign banner.'
              : 'Creates one clickable campaign banner for all selected products.'}
          </small>
        </span>
        <span className="sale-home-toggle-control" aria-hidden="true" />
      </label>
      <p className="sale-home-rule">
        <Icon name="lock" size={14} />
        Individual product discounts change the price only and never create a banner automatically.
      </p>
      {form.invalidPreviewCount > 0 && (
        <p className="sale-validation-message">
          The discount must create a price above ₱0 and below the base price for every selected
          product.
        </p>
      )}
      {!form.isDateRangeValid && (
        <p className="sale-validation-message">The end date must be after the start date.</p>
      )}
      <div className="sale-submit-row">
        <span>
          <Icon name="lock" size={15} /> Discounts never overwrite the original product price.
        </span>
        <button
          className="sale-primary-button"
          disabled={
            !form.name.trim() ||
            !form.selected.length ||
            !form.isDiscountValid ||
            !form.isDateRangeValid ||
            form.isSaving
          }
          type="submit"
        >
          {form.isSaving ? 'Saving…' : 'Create sale'}
          {!form.isSaving && <Icon name="arrow" size={15} />}
        </button>
      </div>
    </section>
  )
}
