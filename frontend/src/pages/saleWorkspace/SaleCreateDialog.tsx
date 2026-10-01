import { Icon } from '../../components/ui/icon/Icon'
import { SaleDetailsSection } from './SaleDetailsSection'
import { SaleProductSelection } from './SaleProductSelection'
import { SaleReviewSection } from './SaleReviewSection'
import type { SaleFormState } from './useSaleForm'

export function SaleCreateDialog({ form }: { form: SaleFormState }) {
  if (!form.isFormOpen || form.editingSaleId) return null
  return (
    <div
      className="sale-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) form.closeForm()
      }}
    >
      <form
        className="sale-panel sale-form"
        id="sale-promotion-form"
        onSubmit={form.submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-form-title"
      >
        <div className="sale-panel-heading">
          <div>
            <span className="sale-eyebrow">CREATE PROMOTION</span>
            <h2 id="sale-form-title">Set up a product sale</h2>
          </div>
          <button
            className="sale-modal-close"
            type="button"
            onClick={form.closeForm}
            aria-label="Close promotion form"
          >
            <Icon name="close" size={17} />
          </button>
        </div>
        <ol className="sale-steps" aria-label="Promotion setup steps">
          <li className={form.name && form.value ? 'is-complete' : 'is-current'}>
            <span>1</span>
            <div>
              <strong>Sale details</strong>
              <small>Name, discount &amp; dates</small>
            </div>
          </li>
          <li className={form.selected.length ? 'is-complete' : ''}>
            <span>2</span>
            <div>
              <strong>Select products</strong>
              <small>{form.selected.length} selected</small>
            </div>
          </li>
          <li className={form.isDiscountValid && form.selected.length ? 'is-complete' : ''}>
            <span>3</span>
            <div>
              <strong>Review discount</strong>
              <small>Check final prices</small>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>Create sale</strong>
              <small>Publish promotion</small>
            </div>
          </li>
        </ol>
        <SaleDetailsSection form={form} />
        <SaleProductSelection form={form} />
        <SaleReviewSection form={form} />
      </form>
    </div>
  )
}
