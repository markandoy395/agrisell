import { Icon } from '../../components/ui/icon/Icon'
import type { SaleFormState } from './useSaleForm'
import {
  getDiscountLabel,
  getSalePrice,
  getStockLabel,
  getStockTone,
  peso,
  timeRangesOverlap,
} from './saleWorkspace.utils'

export function SaleProductSelection({ form }: { form: SaleFormState }) {
  const scopedFarm = form.activeFarmScopeId
    ? form.farms.find((f) => f.id === form.activeFarmScopeId)
    : null

  return (
    <section className="sale-form-section" aria-labelledby="sale-products-heading">
      <div className="sale-section-title">
        <span>2</span>
        <div>
          <h3 id="sale-products-heading">Select products</h3>
          <p>
            {scopedFarm
              ? `Showing only products belonging to ${scopedFarm.name}.`
              : 'Select products across all farms or filter by specific farm.'}
          </p>
        </div>
        <strong className="sale-selection-count">{form.selected.length} selected</strong>
      </div>
      <div className="sale-product-toolbar dashboard-filter-grid">
        <label className="dashboard-filter-field">
          <span>Search</span>
          <span className="sale-search dashboard-filter-control">
            <Icon name="search" size={16} />
          <input
            aria-label="Search products"
            placeholder="Search products, category, or farm…"
            value={form.productQuery}
            onChange={(event) => form.setProductQuery(event.target.value)}
          />
          </span>
        </label>

        {scopedFarm ? (
          <div className="dashboard-filter-field">
            <span>Farm</span>
            <span className="sale-active-farm-indicator" title={`Locked to ${scopedFarm.name}`}>
              <Icon name="sprout" size={14} />
              <b>{scopedFarm.name}</b>
            </span>
          </div>
        ) : (
          <label className="dashboard-filter-field">
            <span>Farm</span>
          <select
            aria-label="Filter by farm"
            value={form.farmFilter}
            onChange={(event) => form.setFarmFilter(event.target.value)}
          >
            <option value="all">All farms</option>
            {form.farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
          </label>
        )}

        <label className="dashboard-filter-field">
          <span>Category</span>
        <select
          aria-label="Filter by category"
          value={form.categoryFilter}
          onChange={(event) => form.setCategoryFilter(event.target.value)}
        >
          <option value="all">All categories</option>
          {form.categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        </label>
        <label className="dashboard-filter-field">
          <span>Stock</span>
        <select
          aria-label="Filter by stock"
          value={form.stockFilter}
          onChange={(event) => form.setStockFilter(event.target.value)}
        >
          <option value="all">All stock</option>
          <option value="available">Available</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        </label>
        <label className="dashboard-filter-field">
          <span>Promotion</span>
        <select
          aria-label="Filter by promotion"
          value={form.saleProductFilter}
          onChange={(event) => form.setSaleProductFilter(event.target.value)}
        >
          <option value="all">All sale states</option>
          <option value="available">Not on sale</option>
          <option value="on_sale">Already on sale</option>
        </select>
        </label>
      </div>
      <div className="sale-product-actions">
        <span>{form.visibleProducts.length} products shown</span>
        <button type="button" onClick={form.selectVisible}>
          Select visible
        </button>
        <button type="button" onClick={form.clearVisible}>
          Clear visible
        </button>
      </div>
      <div className="sale-product-list">
        {form.visibleProducts.map((product) => {
          const conflict = (form.enabledProductSales.get(product.id) ?? []).find(
            (sale) =>
              sale.id !== form.editingSaleId && timeRangesOverlap(form.startsAt, form.endsAt, sale),
          )
          const unavailable = Boolean(conflict) || getStockTone(product) === 'out'
          const checked = form.selected.includes(product.id)
          const price = getSalePrice(product.price, form.type, form.discountValue)
          const showPreview = form.value !== '' && price > 0 && price < product.price
          return (
            <label
              className={`sale-product ${checked ? 'is-selected' : ''} ${unavailable ? 'is-unavailable' : ''}`}
              key={product.id}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={unavailable}
                onChange={() =>
                  form.setSelected((items) =>
                    items.includes(product.id)
                      ? items.filter((id) => id !== product.id)
                      : [...items, product.id],
                  )
                }
              />
              <span className="sale-checkmark" aria-hidden="true" />
              <span className="sale-product-image">
                <Icon name="leaf" size={20} />
                {product.imageUrl && (
                  <img
                    src={product.imageUrl}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
                )}
              </span>
              <span className="sale-product-info">
                <strong>{product.name}</strong>
                <small>
                  {product.farmName ? (
                    <span className="sale-product-farm-tag">
                      <Icon name="sprout" size={11} />
                      {product.farmName} ·{' '}
                    </span>
                  ) : null}
                  {product.category ?? 'Fresh produce'} · {getStockLabel(product)}
                </small>
                {conflict && <em>Included in “{conflict.name}”</em>}
              </span>
              <span className="sale-product-price">
                {showPreview ? (
                  <>
                    <s>
                      {peso(product.price)}/{product.unit}
                    </s>
                    <strong>
                      {peso(price)}/{product.unit}
                    </strong>
                  </>
                ) : (
                  <strong>
                    {peso(product.price)}/{product.unit}
                  </strong>
                )}
                <small>
                  {showPreview
                    ? getDiscountLabel(form.type, form.discountValue)
                    : 'Enter a discount'}
                </small>
              </span>
            </label>
          )
        })}
        {!form.visibleProducts.length && (
          <div className="sale-empty">
            <Icon name="search" size={22} />
            <strong>No products found</strong>
            <span>
              {scopedFarm
                ? `No commodities found for ${scopedFarm.name} matching the selected filters.`
                : 'Try clearing one of the filters or selecting another farm.'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
