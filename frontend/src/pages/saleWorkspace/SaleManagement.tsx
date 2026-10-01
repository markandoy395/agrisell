import { useMemo, useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type { FarmOption, Sale, SaleScope, SaleStatus } from './saleWorkspace.types'
import {
  formatSaleDate,
  getDiscountLabel,
  isFarmerSale,
  SALE_STATUSES,
  summarizeSaleProducts,
} from './saleWorkspace.utils'

type SaleManagementProps = {
  busySaleId: string | null
  counts: Record<SaleStatus, number>
  farms: FarmOption[]
  filter: SaleStatus
  onEdit: (sale: Sale) => void
  onFilterChange: (filter: SaleStatus) => void
  onRemove: (sale: Sale) => void
  onToggle: (sale: Sale) => void
  sales: Sale[]
  statusById: Map<string, SaleStatus>
}

export function SaleManagement(props: SaleManagementProps) {
  const [scopeFilter, setScopeFilter] = useState<SaleScope>('all')
  const [farmFilter, setFarmFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Compute platform vs farmer totals
  const platformCount = useMemo(
    () => props.sales.filter((sale) => !sale.farmId).length,
    [props.sales],
  )
  const farmerCount = useMemo(
    () => props.sales.filter((sale) => Boolean(sale.farmId)).length,
    [props.sales],
  )

  // Derive active farms present in the sales list (plus props.farms)
  const availableFarms = useMemo(() => {
    const farmMap = new Map<string, string>()
    props.farms.forEach((f) => {
      farmMap.set(f.id, f.name + (f.farmerName ? ` (${f.farmerName})` : ''))
    })
    props.sales.forEach((s) => {
      if (s.farmId && !farmMap.has(s.farmId)) {
        farmMap.set(s.farmId, s.farmName ?? `Farm #${s.farmId}`)
      }
    })
    return Array.from(farmMap.entries()).map(([id, name]) => ({ id, name }))
  }, [props.farms, props.sales])

  const filteredSales = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return props.sales.filter((sale) => {
      // 1. Status filter
      if (props.statusById.get(sale.id) !== props.filter) return false

      // 2. Scope filter
      const isFarmer = isFarmerSale(sale)
      if (scopeFilter === 'platform' && isFarmer) return false
      if (scopeFilter === 'farmer' && !isFarmer) return false

      // 3. Farm filter
      if (farmFilter !== 'all' && sale.farmId !== farmFilter) return false

      // 4. Search query
      if (query) {
        const matchesName = sale.name.toLowerCase().includes(query)
        const matchesCode = sale.promoCode ? sale.promoCode.toLowerCase().includes(query) : false
        const matchesFarm = sale.farmName ? sale.farmName.toLowerCase().includes(query) : false
        const matchesFarmer = sale.farmerName ? sale.farmerName.toLowerCase().includes(query) : false
        if (!matchesName && !matchesCode && !matchesFarm && !matchesFarmer) return false
      }

      return true
    })
  }, [farmFilter, props.filter, props.sales, props.statusById, scopeFilter, searchQuery])

  return (
    <section className="sale-panel sale-management" aria-labelledby="promotion-management-heading">
      <div className="sale-panel-heading">
        <div>
          <span className="sale-eyebrow">PROMOTION MANAGEMENT</span>
          <h2 id="promotion-management-heading">Promotions &amp; Discounts</h2>
        </div>
        <div className="sale-header-stats">
          <span className="sale-panel-total">{props.sales.length} total</span>
          <span className="sale-panel-substat">{platformCount} platform</span>
          <span className="sale-panel-substat">{farmerCount} farmer</span>
        </div>
      </div>

      {/* Scope, Farm Ownership, and Search Toolbar */}
      <div className="sale-scope-toolbar dashboard-filter-grid" aria-label="Filter promotions by scope and farm">
        <label className="dashboard-filter-field">
          <span>Status</span>
          <select
            value={props.filter}
            onChange={(event) => props.onFilterChange(event.target.value as SaleStatus)}
          >
            {SALE_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label} ({props.counts[status.key]})
              </option>
            ))}
          </select>
        </label>
        <label className="dashboard-filter-field">
          <span>Source</span>
          <select
            value={scopeFilter}
            onChange={(event) => {
              const scope = event.target.value as SaleScope
              setScopeFilter(scope)
              if (scope === 'platform') setFarmFilter('all')
            }}
          >
            <option value="all">All Sources ({props.sales.length})</option>
            <option value="platform">Platform-wide ({platformCount})</option>
            <option value="farmer">Farmer Promotions ({farmerCount})</option>
          </select>
        </label>

        <div className="sale-scope-filters">
          <label className="sale-farm-filter-wrap dashboard-filter-field">
            <span>Farm</span>
            <select
              aria-label="Filter by Farm"
              value={farmFilter}
              onChange={(event) => {
                setFarmFilter(event.target.value)
                if (event.target.value !== 'all' && scopeFilter === 'platform') {
                  setScopeFilter('all')
                }
              }}
            >
              <option value="all">All Farms / Farmers</option>
              {availableFarms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </label>

          <label className="sale-search-wrap dashboard-filter-field">
            <span>Search</span>
            <span className="dashboard-filter-control">
              <Icon name="search" size={15} />
            <input
              aria-label="Search promotions"
              placeholder="Search promotion, farm, or code…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="sale-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
            </span>
          </label>
        </div>
      </div>

      <div className="sale-promotion-table">
        <div className="sale-promotion-columns" aria-hidden="true">
          <span>Promotion &amp; Ownership</span>
          <span>Schedule</span>
          <span>Products</span>
          <span>Actions</span>
        </div>
        <div className="sale-promotion-list">
          {filteredSales.map((sale) => {
            const status = props.statusById.get(sale.id) ?? 'disabled'
            const isFarmer = isFarmerSale(sale)

            return (
              <article
                className={`sale-promotion ${isFarmer ? 'sale-promotion--farmer' : 'sale-promotion--platform'}`}
                key={sale.id}
              >
                <div className="sale-promotion-main">
                  <span
                    className={`sale-promotion-icon ${isFarmer ? 'is-farmer-icon' : ''}`}
                    title={isFarmer ? 'Farmer Promotion' : 'Platform Promotion'}
                  >
                    <Icon name={isFarmer ? 'leaf' : 'tag'} size={21} />
                  </span>
                  <div>
                    <div className="sale-promotion-title">
                      <strong>{sale.name}</strong>
                      <span className={`sale-status sale-status-${status}`}>{status}</span>

                      {/* Clear Scope Badge */}
                      {isFarmer ? (
                        <span
                          className="sale-scope-badge sale-scope-farmer"
                          title={`Created by farmer for ${sale.farmName ?? 'their farm'}`}
                        >
                          <Icon name="sprout" size={12} />
                          {sale.farmName ?? 'Farmer Promotion'}
                        </span>
                      ) : (
                        <span
                          className="sale-scope-badge sale-scope-platform"
                          title="Platform-wide campaign managed by administrators"
                        >
                          🌐 Platform-wide
                        </span>
                      )}

                      {isFarmer && (
                        <span
                          className="sale-owner-warning"
                          title="Private promotion configured by farmer. Modify with caution."
                        >
                          Farmer Owned
                        </span>
                      )}

                      {sale.promoteOnHome && <span className="sale-home-badge">Home banner</span>}
                      {sale.promoCode && <span className="sale-promo-badge">Code: {sale.promoCode}</span>}
                    </div>

                    <p>
                      {isFarmer && sale.farmerName && (
                        <>
                          <span className="sale-farmer-author">
                            Farmer: <b>{sale.farmerName}</b>
                          </span>
                          <i />
                        </>
                      )}
                      {sale.targetUserGroup === 'new_users_only' ? 'New users only' : 'All users'}
                      <i /> {getDiscountLabel(sale.discountType, sale.discountValue)} <i />
                      {sale.products.length} {sale.products.length === 1 ? 'product' : 'products'}
                    </p>
                  </div>
                </div>

                <div
                  className="sale-promotion-schedule"
                  aria-label={`Schedule from ${formatSaleDate(sale.startsAt)} to ${formatSaleDate(sale.endsAt)}`}
                >
                  <Icon name="calendar" size={19} />
                  <span>{formatSaleDate(sale.startsAt)}</span>
                  <b>→</b>
                  <span>{formatSaleDate(sale.endsAt)}</span>
                </div>

                <div
                  className="sale-promotion-products"
                  aria-label={`${sale.products.length} products in this promotion`}
                >
                  <Icon name="tag" size={18} />
                  <span>{summarizeSaleProducts(sale.products)}</span>
                </div>

                <div className="sale-promotion-actions">
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => props.onEdit(sale)}
                    aria-label={
                      isFarmer
                        ? `Edit farmer promotion ${sale.name} for ${sale.farmName}`
                        : `Edit ${sale.name}`
                    }
                    title={
                      isFarmer
                        ? `Edit farmer promotion (${sale.farmName})`
                        : `Edit promotion`
                    }
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="icon-action-button"
                    disabled={props.busySaleId === sale.id}
                    type="button"
                    onClick={() => props.onToggle(sale)}
                    aria-label={`${sale.isEnabled ? 'Disable' : 'Enable'} ${sale.name}`}
                    title={
                      isFarmer
                        ? `${sale.isEnabled ? 'Disable' : 'Enable'} farmer promotion`
                        : sale.isEnabled
                          ? 'Disable'
                          : 'Enable'
                    }
                  >
                    <Icon name="power" size={16} />
                  </button>
                  <button
                    className={`icon-action-button icon-action-button--danger ${isFarmer ? 'is-farmer-action' : ''}`}
                    disabled={props.busySaleId === sale.id}
                    type="button"
                    onClick={() => props.onRemove(sale)}
                    aria-label={
                      isFarmer
                        ? `Delete farmer promotion ${sale.name} (${sale.farmName})`
                        : `Remove ${sale.name}`
                    }
                    title={
                      isFarmer
                        ? `Delete farmer promotion (Use caution)`
                        : `Remove promotion`
                    }
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </article>
            )
          })}

          {!filteredSales.length && (
            <div className="sale-empty">
              <Icon name="calendar" size={22} />
              <strong>No promotions match your filters</strong>
              <span>
                {searchQuery || farmFilter !== 'all' || scopeFilter !== 'all'
                  ? 'Try adjusting your search, farm, or scope filter.'
                  : `No ${props.filter} promotions found.`}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
