import { Icon } from '../../components/ui/icon/Icon'
import type { DiscountType, TargetGroup } from './saleWorkspace.types'
import type { SaleFormState } from './useSaleForm'
import { getDiscountLabel } from './saleWorkspace.utils'

export function SaleEditDialog({ form }: { form: SaleFormState }) {
  if (!form.isFormOpen || !form.editingSaleId) return null

  const isFarmerScoped = Boolean(form.editingFarmId)

  return (
    <div
      className="sale-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) form.closeForm()
      }}
    >
      <form
        className="sale-edit-form"
        onSubmit={form.submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-edit-title"
      >
        <header className="sale-edit-header">
          <div>
            <div className="sale-edit-title-wrap">
              <h2 id="sale-edit-title">Edit Promotion</h2>
              {isFarmerScoped ? (
                <span className="sale-scope-badge sale-scope-farmer">
                  <Icon name="sprout" size={13} />
                  {form.editingFarmName}
                </span>
              ) : (
                <span className="sale-scope-badge sale-scope-platform">🌐 Platform-wide</span>
              )}
            </div>
            <p>Update the promotion details and save your changes.</p>
          </div>
          <button
            className="sale-modal-close"
            type="button"
            onClick={form.closeForm}
            aria-label="Close promotion editor"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        {/* Farmer Ownership Warning Banner */}
        {isFarmerScoped && (
          <div className="sale-farmer-warning-banner" role="alert">
            <Icon name="alert" size={20} />
            <div>
              <strong>Farmer Promotion: {form.editingFarmName}</strong>
              <p>
                This promotion was created specifically for <b>{form.editingFarmName}</b>
                {form.editingFarmerName ? ` by ${form.editingFarmerName}` : ''}.
                Only products belonging to this farm can be discounted. Modifying this promotion will directly affect the farmer's live discounts in the buyer app.
              </p>
            </div>
          </div>
        )}

        <div className="sale-edit-grid">
          <label className="sale-edit-field">
            <span>
              Promotion name <b>*</b>
            </span>
            <span className="sale-edit-control">
              <Icon name="tag" size={17} />
              <input
                required
                value={form.name}
                onChange={(event) => form.setName(event.target.value)}
              />
            </span>
          </label>
          <label className="sale-edit-field">
            <span>
              Audience <b>*</b>
            </span>
            <span className="sale-edit-control">
              <Icon name="users" size={17} />
              <select
                value={form.target}
                onChange={(event) => form.setTarget(event.target.value as TargetGroup)}
              >
                <option value="all_users">All users</option>
                <option value="new_users_only">New users only</option>
              </select>
            </span>
          </label>
          <label className="sale-edit-field">
            <span>
              Discount type <b>*</b>
            </span>
            <span className="sale-edit-control">
              <Icon name="trend" size={17} />
              <select
                value={form.type}
                onChange={(event) => form.setType(event.target.value as DiscountType)}
              >
                <option value="percentage">Percentage off (%)</option>
                <option value="amount">Fixed amount (₱ OFF)</option>
                <option value="sale_price">Fixed sale price</option>
              </select>
            </span>
          </label>
          <label className="sale-edit-field">
            <span>
              Discount value <b>*</b>
            </span>
            <span className="sale-edit-control sale-edit-value">
              <Icon name="card" size={17} />
              <input
                required
                min="0.01"
                max={form.type === 'percentage' ? '99.99' : undefined}
                step="0.01"
                type="number"
                value={form.value}
                onChange={(event) => form.setValue(event.target.value)}
              />
              <em>
                {form.type === 'percentage' ? '% OFF' : form.type === 'amount' ? 'OFF' : 'SALE'}
              </em>
            </span>
          </label>
          <label className="sale-edit-field sale-edit-wide">
            <span>
              Products <b>*</b>
              {isFarmerScoped && <em className="sale-scope-note"> (Restricted to {form.editingFarmName})</em>}
            </span>
            <span className="sale-edit-products">
              <Icon name="tag" size={17} />
              <span className="sale-edit-chips">
                {form.selectedProducts.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() =>
                      form.setSelected((items) => items.filter((id) => id !== product.id))
                    }
                  >
                    {product.name}
                    <i>×</i>
                  </button>
                ))}
              </span>
              <select
                aria-label="Add a product"
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    form.setSelected((items) => [...new Set([...items, event.target.value])])
                }}
              >
                <option value="">Add product…</option>
                {form.products
                  .filter((product) => {
                    if (isFarmerScoped && product.farmId !== form.editingFarmId) return false
                    return !form.selected.includes(product.id)
                  })
                  .map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.name}
                    </option>
                  ))}
              </select>
            </span>
            <small>
              {isFarmerScoped
                ? `Only products from ${form.editingFarmName} are selectable for this farmer promotion.`
                : 'Select one or more products to apply this promotion.'}
            </small>
          </label>
          <label className="sale-edit-field">
            <span>Start date &amp; time</span>
            <span className="sale-edit-control">
              <Icon name="calendar" size={17} />
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => form.setStartsAt(event.target.value)}
              />
            </span>
          </label>
          <label className="sale-edit-field">
            <span>End date &amp; time</span>
            <span className="sale-edit-control">
              <Icon name="calendar" size={17} />
              <input
                type="datetime-local"
                min={form.startsAt || undefined}
                value={form.endsAt}
                onChange={(event) => form.setEndsAt(event.target.value)}
              />
            </span>
          </label>
          <label className="sale-edit-field sale-edit-wide">
            <span>Placement / Banner</span>
            <span className="sale-edit-control">
              <Icon name="document" size={17} />
              <select
                value={form.promoteOnHome ? 'home' : 'none'}
                onChange={(event) => form.setPromoteOnHome(event.target.value === 'home')}
              >
                <option value="none">No banner (Default)</option>
                <option value="home" disabled={form.selected.length < 2}>
                  Home banner
                </option>
              </select>
            </span>
            <small>
              {form.selected.length < 2
                ? 'Select at least two products to use a Home banner.'
                : 'Choose where this promotion will be featured.'}
            </small>
          </label>
          <label className="sale-edit-field sale-edit-wide">
            <span>Notes / Description</span>
            <span className="sale-edit-control sale-edit-notes">
              <Icon name="document" size={17} />
              <textarea
                readOnly
                value={`${isFarmerScoped ? `[Farmer Promotion: ${form.editingFarmName}] ` : '[Platform Promotion] '}${form.target === 'new_users_only' ? 'New users only' : 'All users'} · ${form.value && form.discountValue > 0 ? getDiscountLabel(form.type, form.discountValue) : 'Discount not set'} · ${form.selected.length} ${form.selected.length === 1 ? 'product' : 'products'}`}
              />
            </span>
            <small>This summary is generated from the promotion settings.</small>
          </label>
        </div>
        {!form.isDateRangeValid && (
          <p className="sale-edit-error">The end date must be after the start date.</p>
        )}
        {form.invalidPreviewCount > 0 && (
          <p className="sale-edit-error">The discount must lower every selected product price.</p>
        )}
        <footer className="sale-edit-footer">
          <button type="button" onClick={form.closeForm}>
            Cancel
          </button>
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
            <Icon name="save" size={16} />
            {form.isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>
    </div>
  )
}
