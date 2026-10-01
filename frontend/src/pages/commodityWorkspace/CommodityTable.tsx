import { useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { AdminCommodity } from '../../types/commodityWorkspace'

type CommodityTableProps = {
  busyCommodityId: string | null
  commodities: AdminCommodity[]
  currentPage: number
  filteredCount: number
  totalPages: number
  onEdit: (commodity: AdminCommodity) => void
  onPageChange: (page: number) => void
  onStatusChange: (
    commodity: AdminCommodity,
    newStatus: 'available' | 'hidden' | 'delisted' | 'approved',
  ) => void
}

export function CommodityTable({
  busyCommodityId,
  commodities,
  currentPage,
  filteredCount,
  totalPages,
  onEdit,
  onPageChange,
  onStatusChange,
}: CommodityTableProps) {
  const [expandedCommodityId, setExpandedCommodityId] = useState<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedCommodityId((prev) => (prev === id ? null : id))
  }

  if (commodities.length === 0) {
    return (
      <div className="commodity-empty-state">
        <div className="commodity-empty-icon">
          <Icon name="basket" size={36} />
        </div>
        <h3>No commodities found</h3>
        <p>Try adjusting your search query or filter selections.</p>
      </div>
    )
  }

  return (
    <div className="commodity-table-wrapper">
      <div className="commodity-table-scroll">
        <table className="commodity-table">
        <thead>
          <tr>
            <th scope="col">Product / Produce</th>
            <th scope="col">Farm &amp; Origin</th>
            <th scope="col">Category</th>
            <th scope="col">Price &amp; Stock</th>
            <th scope="col">Production Stage</th>
            <th scope="col">Catalog Status</th>
            <th scope="col">Batches &amp; Freshness</th>
            <th scope="col" className="commodity-col-actions">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {commodities.map((item) => {
            const isBusy = busyCommodityId === item.commodityId
            const isExpanded = expandedCommodityId === item.commodityId
            const isAvailable = item.status.toLowerCase() === 'available'
            const isHidden = item.status.toLowerCase() === 'hidden'
            const isDelisted = item.status.toLowerCase() === 'delisted'
            const isOutOfStock =
              item.status.toLowerCase() === 'out_of_stock' || item.availableQuantity <= 0

            return (
              <tr
                key={item.commodityId}
                className={`commodity-row ${isExpanded ? 'is-expanded' : ''}`}
              >
                <td className="commodity-cell-product">
                  <div className="commodity-product-info">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="commodity-thumbnail"
                        loading="lazy"
                      />
                    ) : (
                      <div className="commodity-thumbnail-placeholder" aria-hidden="true">
                        <Icon name="basket" size={20} />
                      </div>
                    )}
                    <div>
                      <div className="commodity-name-row">
                        <strong className="commodity-name">{item.name}</strong>
                        {item.isOrganic && (
                          <span className="commodity-badge-organic" title="Certified organic">
                            Organic
                          </span>
                        )}
                      </div>
                      <span className="commodity-id">#AG-C{item.commodityId}</span>
                      {item.gradeQuality && (
                        <span className="commodity-grade">Grade: {item.gradeQuality}</span>
                      )}
                    </div>
                  </div>
                </td>

                <td className="commodity-cell-farm">
                  <strong>{item.farmName}</strong>
                  <span className="commodity-farmer-sub">{item.farmerName}</span>
                  <small className="commodity-location-sub">{item.farmLocation}</small>
                </td>

                <td>
                  <span className="commodity-category-badge">{item.categoryName}</span>
                </td>

                <td>
                  <div className="commodity-price-stock">
                    <strong className="commodity-price">
                      ₱{item.price.toFixed(2)}
                      <span className="commodity-unit">/{item.unitType}</span>
                    </strong>
                    <span
                      className={`commodity-stock-badge ${
                        isOutOfStock
                          ? 'is-empty'
                          : item.availableQuantity <= 10
                            ? 'is-low'
                            : 'is-plenty'
                      }`}
                    >
                      {item.availableQuantity} {item.unitType} available
                    </span>
                    {item.minimumOrderQuantity != null && (
                      <span className="commodity-moq-badge" title="Minimum Order Quantity">
                        Min: {item.minimumOrderQuantity} {item.unitType}
                      </span>
                    )}
                  </div>
                </td>

                <td>
                  <div className="commodity-stages">
                    <span
                      className={`commodity-stage-badge is-${item.productionStatus.toLowerCase()}`}
                    >
                      {item.productionStatus}
                    </span>
                    <span className="commodity-availability-sub">
                      {item.availabilityStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                </td>

                <td>
                  <span className={`commodity-status-badge is-${item.status.toLowerCase()}`}>
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </td>

                <td>
                  {item.batches.length > 0 ? (
                    <div className="commodity-batches-summary">
                      <button
                        type="button"
                        className="commodity-batch-toggle"
                        onClick={() => toggleExpand(item.commodityId)}
                        aria-expanded={isExpanded}
                      >
                        <Icon name="calendar" size={13} />
                        <span>
                          {item.batches.length} {item.batches.length === 1 ? 'batch' : 'batches'}
                        </span>
                        <Icon name={isExpanded ? 'chevron' : 'arrow'} size={12} />
                      </button>
                      {isExpanded && (
                        <div className="commodity-batch-dropdown">
                          {item.batches.map((b) => (
                            <div key={b.id} className="commodity-batch-item">
                              <div className="commodity-batch-header-row">
                                <span className="commodity-batch-code">
                                  {b.lotCode || 'Standard Lot'}
                                </span>
                                <span className="commodity-batch-type-tag">
                                  {(b.dateType || 'fresh').replace(/_/g, ' ')}
                                </span>
                              </div>
                              <span className="commodity-batch-qty">
                                Stock: {b.quantityRemaining}/{b.quantityReceived} {item.unitType}
                              </span>
                              {b.harvestedAt && (
                                <small className="commodity-batch-date">
                                  Harvest: {b.harvestedAt}
                                </small>
                              )}
                              {b.sellUntil && (
                                <small className="commodity-batch-date">
                                  Sell by: {b.sellUntil}
                                </small>
                              )}
                              {b.expiresAt && (
                                <small className="commodity-batch-date is-expiry">
                                  Exp: {b.expiresAt}
                                </small>
                              )}
                              {b.storageInstructions && (
                                <small
                                  className="commodity-batch-storage"
                                  title={b.storageInstructions}
                                >
                                  Storage: {b.storageInstructions}
                                </small>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="commodity-no-batches">
                      {item.harvestDate ? `Harvested ${item.harvestDate}` : 'No lot records'}
                    </span>
                  )}
                </td>


                <td className="commodity-cell-actions">
                  <div className="commodity-action-buttons">
                    {/* Approve / Make Available */}
                    {(!isAvailable || isHidden || isDelisted) && (
                      <button
                        type="button"
                        className="commodity-action-btn is-approve"
                        onClick={() => onStatusChange(item, 'available')}
                        disabled={isBusy}
                        title="Approve and make visible to marketplace buyers"
                      >
                        <Icon name="check" size={13} />
                        <span>Approve</span>
                      </button>
                    )}

                    {/* Hide */}
                    {isAvailable && (
                      <button
                        type="button"
                        className="commodity-action-btn is-hide"
                        onClick={() => onStatusChange(item, 'hidden')}
                        disabled={isBusy}
                        title="Temporarily hide from marketplace buyers"
                      >
                        <Icon name="eyeOff" size={13} />
                        <span>Hide</span>
                      </button>
                    )}

                    {/* Delist */}
                    {!isDelisted && (
                      <button
                        type="button"
                        className="commodity-action-btn is-delist"
                        onClick={() => onStatusChange(item, 'delisted')}
                        disabled={isBusy}
                        title="Delist from catalog"
                      >
                        <Icon name="power" size={13} />
                        <span>Delist</span>
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      type="button"
                      className="commodity-action-btn is-edit"
                      onClick={() => onEdit(item)}
                      disabled={isBusy}
                      title="Edit product category and description"
                    >
                      <Icon name="edit" size={13} />
                      <span>Edit</span>
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="commodity-pagination">
          <span className="commodity-pagination-info">
            Showing {commodities.length} of {filteredCount}
          </span>
          <button
            type="button"
            className="commodity-page-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Previous
          </button>
          <div className="commodity-page-numbers">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`commodity-page-num ${p === currentPage ? 'is-active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="commodity-page-btn"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
