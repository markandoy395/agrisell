import { useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { Product, Sale, SaleStatus } from './saleWorkspace.types'
import {
  getDiscountLabel,
  getSalePrice,
  peso,
  SALE_OVERVIEW_PAGE_SIZE,
} from './saleWorkspace.utils'

type SaleProductOverviewProps = {
  items: Array<{ product: Product; sale: Sale; status: SaleStatus }>
}

export function SaleProductOverview({ items }: SaleProductOverviewProps) {
  const [limit, setLimit] = useState(SALE_OVERVIEW_PAGE_SIZE)
  const visibleItems = items.slice(0, limit)
  return (
    <section className="sale-panel sale-overview" aria-labelledby="products-on-sale-heading">
      <div className="sale-panel-heading">
        <div>
          <span className="sale-eyebrow">PRODUCT-LEVEL OVERVIEW</span>
          <h2 id="products-on-sale-heading">Products on sale</h2>
        </div>
        <p>See every active and upcoming price at a glance with seller attribution.</p>
      </div>
      <div className="sale-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Farm / Seller</th>
              <th>Original</th>
              <th>Sale price</th>
              <th>Discount</th>
              <th>Promotion</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map(({ product, sale, status }) => {
              const farmName = sale.farmName ?? product.farmName
              return (
                <tr key={`${sale.id}-${product.id}`}>
                  <td data-label="Product">
                    <span className="sale-table-product">
                      <span className="sale-product-image">
                        <Icon name="leaf" size={17} />
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
                      <span>
                        <strong>{product.name}</strong>
                        <small>{product.category ?? 'Fresh produce'}</small>
                      </span>
                    </span>
                  </td>
                  <td data-label="Farm / Seller">
                    {farmName ? (
                      <span className="sale-table-farm" title={farmName}>
                        <Icon name="sprout" size={13} />
                        <span>
                          <strong>{farmName}</strong>
                          {sale.farmerName ? <small>{sale.farmerName}</small> : null}
                        </span>
                      </span>
                    ) : (
                      <span className="sale-table-platform">Platform-wide</span>
                    )}
                  </td>
                  <td data-label="Original">
                    <s>
                      {peso(product.price)}/{product.unit}
                    </s>
                  </td>
                  <td data-label="Sale price">
                    <strong className="sale-table-price">
                      {peso(getSalePrice(product.price, sale.discountType, sale.discountValue))}/
                      {product.unit}
                    </strong>
                  </td>
                  <td data-label="Discount">
                    <span className="sale-discount-chip">
                      {getDiscountLabel(sale.discountType, sale.discountValue)}
                    </span>
                  </td>
                  <td data-label="Promotion">{sale.name}</td>
                  <td data-label="Status">
                    <span className={`sale-status sale-status-${status}`}>{status}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {items.length > visibleItems.length && (
          <div className="sale-overview-more">
            <span>
              Showing {visibleItems.length} of {items.length} products
            </span>
            <button
              type="button"
              onClick={() => setLimit((value) => value + SALE_OVERVIEW_PAGE_SIZE)}
            >
              Show 50 more
            </button>
          </div>
        )}
        {!items.length && (
          <div className="sale-empty">
            <Icon name="basket" size={22} />
            <strong>No products on sale</strong>
            <span>Create or schedule a promotion to see discounted products here.</span>
          </div>
        )}
      </div>
    </section>
  )
}
