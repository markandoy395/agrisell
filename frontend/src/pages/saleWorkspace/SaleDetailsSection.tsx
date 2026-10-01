import { Icon } from '../../components/ui/icon/Icon'
import type { DiscountType } from './saleWorkspace.types'
import type { SaleFormState } from './useSaleForm'

export function SaleDetailsSection({ form }: { form: SaleFormState }) {
  return (
    <section className="sale-form-section" aria-labelledby="sale-details-heading">
      <div className="sale-section-title">
        <span>1</span>
        <div>
          <h3 id="sale-details-heading">Sale details</h3>
          <p>Define the promotion scope, offer, and campaign duration.</p>
        </div>
      </div>
      <div className="sale-detail-grid">
        <label className="sale-field">
          <span>Promotion scope</span>
          <select
            value={form.scope}
            onChange={(event) => {
              const nextScope = event.target.value as 'platform' | 'farmer'
              form.setScope(nextScope)
              if (nextScope === 'platform') {
                form.setSelectedFarmId('')
              }
              form.setSelected([])
            }}
          >
            <option value="platform">🌐 Platform-wide (Marketplace)</option>
            <option value="farmer">🌾 Farm-specific Promotion</option>
          </select>
        </label>

        {form.scope === 'farmer' ? (
          <label className="sale-field">
            <span>
              Target Farm <b>*</b>
            </span>
            <select
              required
              value={form.selectedFarmId}
              onChange={(event) => {
                form.setSelectedFarmId(event.target.value)
                form.setSelected([])
              }}
            >
              <option value="">Choose a farm…</option>
              {form.farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name} {farm.farmerName ? `(${farm.farmerName})` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="sale-field sale-field-placeholder" aria-hidden="true" />
        )}

        <label className="sale-field sale-field-wide">
          <span>Sale name <b>*</b></span>
          <input
            required
            placeholder={
              form.scope === 'farmer'
                ? 'e.g. Farm Fresh Harvest Discount'
                : 'e.g. Weekend Marketplace Harvest Sale'
            }
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
          />
        </label>
        <label className="sale-field">
          <span>Discount type</span>
          <select
            value={form.type}
            onChange={(event) => form.setType(event.target.value as DiscountType)}
          >
            <option value="percentage">Percentage off</option>
            <option value="amount">Peso amount off</option>
            <option value="sale_price">Fixed sale price</option>
          </select>
        </label>
        <label className="sale-field">
          <span>Discount value <b>*</b></span>
          <span className="sale-input-affix">
            <b>{form.type === 'percentage' ? '%' : '₱'}</b>
            <input
              required
              min="0.01"
              max={form.type === 'percentage' ? '99.99' : undefined}
              step="0.01"
              type="number"
              placeholder={form.type === 'percentage' ? '10' : '0.00'}
              value={form.value}
              onChange={(event) => form.setValue(event.target.value)}
            />
          </span>
        </label>
        <label className="sale-field">
          <span>Starts</span>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => form.setStartsAt(event.target.value)}
          />
        </label>
        <label className="sale-field">
          <span>Ends</span>
          <input
            type="datetime-local"
            min={form.startsAt || undefined}
            value={form.endsAt}
            onChange={(event) => form.setEndsAt(event.target.value)}
          />
        </label>
        <label className="sale-field sale-field-wide">
          <span>Promo / Voucher code (optional)</span>
          <input
            placeholder="e.g. HARVEST20"
            value={form.promoCode}
            onChange={(event) => form.setPromoCode(event.target.value.toUpperCase())}
          />
        </label>
      </div>

      {form.scope === 'farmer' && form.selectedFarmId && (
        <div className="sale-scope-callout">
          <Icon name="sprout" size={16} />
          <span>
            This promotion will be scoped to{' '}
            <b>{form.farms.find((f) => f.id === form.selectedFarmId)?.name ?? 'the selected farm'}</b>.
            Only commodities produced by this farm can be included.
          </span>
        </div>
      )}

      <fieldset className="sale-audience-fieldset">
        <legend>Target users</legend>
        <label className={form.target === 'all_users' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="target-users"
            value="all_users"
            checked={form.target === 'all_users'}
            onChange={() => form.setTarget('all_users')}
          />
          <span className="sale-radio-mark" />
          <span>
            <strong>All users</strong>
            <small>Available to eligible existing and new buyers.</small>
          </span>
        </label>
        <label className={form.target === 'new_users_only' ? 'is-selected' : ''}>
          <input
            type="radio"
            name="target-users"
            value="new_users_only"
            checked={form.target === 'new_users_only'}
            onChange={() => form.setTarget('new_users_only')}
          />
          <span className="sale-radio-mark" />
          <span>
            <strong>New users only</strong>
            <small>Only eligible first-time and new buyers.</small>
          </span>
        </label>
      </fieldset>
    </section>
  )
}
