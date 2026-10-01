import { Icon } from '../../components/ui/icon/Icon'
import { CategoryEditDialog } from './CategoryEditDialog'
import { useCategoriesData } from './useCategoriesData'
import './CategoryWorkspace.css'

type CategoryWorkspaceProps = {
  onNotice: (message: string) => void
}

export function CategoryWorkspace({ onNotice }: CategoryWorkspaceProps) {
  const data = useCategoriesData(onNotice)

  return (
    <section
      className="user-workspace farmer-workspace category-workspace"
      aria-labelledby="categories-workspace-title"
    >
      <h1 className="user-workspace-title" id="categories-workspace-title">Categories</h1>

      <div className="category-stats-grid" aria-label="Category summary metrics">
        <div className="category-stat-card">
          <div className="category-stat-icon is-emerald">
            <Icon name="tag" size={20} />
          </div>
          <div className="category-stat-details">
            <span className="category-stat-value">{data.summary.totalCount}</span>
            <span className="category-stat-label">Total Categories</span>
          </div>
          <span className="category-stat-tag">Catalog</span>
        </div>

        <div className="category-stat-card">
          <div className="category-stat-icon is-green">
            <Icon name="check" size={20} />
          </div>
          <div className="category-stat-details">
            <span className="category-stat-value">{data.summary.activeCount}</span>
            <span className="category-stat-label">Active Categories</span>
          </div>
          <span className="category-stat-tag is-live">Live</span>
        </div>

        <div className="category-stat-card">
          <div className="category-stat-icon is-amber">
            <Icon name="alert" size={20} />
          </div>
          <div className="category-stat-details">
            <span className="category-stat-value">{data.summary.delistedCount}</span>
            <span className="category-stat-label">Delisted</span>
          </div>
          <span className="category-stat-tag is-warning">Hidden</span>
        </div>

        <div className="category-stat-card">
          <div className="category-stat-icon is-blue">
            <Icon name="basket" size={20} />
          </div>
          <div className="category-stat-details">
            <span className="category-stat-value">{data.summary.taggedCommodityCount}</span>
            <span className="category-stat-label">Tagged Commodities</span>
          </div>
          <span className="category-stat-tag">Marketplace</span>
        </div>
      </div>

      <div className="category-toolbar dashboard-filter-grid">
        <label className="dashboard-filter-field">
          <span>Search</span>
          <span className="category-search-box dashboard-filter-control">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Categories..."
              value={data.searchQuery}
              onChange={(e) => data.setSearchQuery(e.target.value)}
            />
            {data.searchQuery && (
              <button
                type="button"
                className="category-search-clear"
                onClick={() => data.setSearchQuery('')}
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
        </label>

        <label className="dashboard-filter-field">
          <span>Status</span>
          <select
            value={data.statusFilter}
            onChange={(event) => data.setStatusFilter(event.target.value as 'all' | 'active' | 'delisted')}
          >
            <option value="all">All categories ({data.summary.totalCount})</option>
            <option value="active">Active ({data.summary.activeCount})</option>
            <option value="delisted">Delisted ({data.summary.delistedCount})</option>
          </select>
        </label>

        <div className="category-filter-group dashboard-filter-actions">
          <button
            type="button"
            className={`category-reorder-toggle ${data.isReorderMode ? 'is-reordering' : ''}`}
            onClick={() => data.setIsReorderMode(!data.isReorderMode)}
            title={data.isReorderMode ? 'Exit reorder mode' : 'Reorder categories'}
          >
            <Icon name="sort" size={16} />
            <span>{data.isReorderMode ? 'Done Reordering' : 'Reorder Priority'}</span>
          </button>
        </div>

        <div className="category-toolbar-actions dashboard-filter-actions">
          <button
            type="button"
            className="category-refresh-btn"
            onClick={() => void data.load()}
            disabled={data.isLoading}
            title="Refresh category list"
            aria-label="Refresh categories"
          >
            <Icon name="refresh" size={16} />
          </button>
          <button
            type="button"
            className="primary-button category-create-btn"
            onClick={data.openCreate}
          >
            <Icon name="plus" size={16} />
            <span>Add Category</span>
          </button>
        </div>
      </div>

      {data.isLoading ? (
        <div className="commodity-loading-state" role="status">
          <div className="commodity-loading-spinner" />
          <p>Loading produce categories...</p>
        </div>
      ) : data.error ? (
        <div className="commodity-error-state" role="alert">
          <p>{data.error}</p>
          <button
            type="button"
            className="commodity-secondary-button"
            onClick={() => void data.load()}
          >
            Retry
          </button>
        </div>
      ) : data.categories.length === 0 ? (
        <div className="category-empty-state">
          <div className="category-empty-icon">
            <Icon name="tag" size={32} />
          </div>
          <h3>No categories found</h3>
          <p>
            {data.searchQuery || data.statusFilter !== 'all'
              ? 'No produce categories match your current search or filter criteria.'
              : 'No produce categories have been set up yet. Create your first category to organize marketplace discovery.'}
          </p>
          {data.searchQuery || data.statusFilter !== 'all' ? (
            <button
              type="button"
              className="category-secondary-btn"
              onClick={() => {
                data.setSearchQuery('')
                data.setStatusFilter('all')
              }}
            >
              Reset Filters
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={data.openCreate}
            >
              + Create Category
            </button>
          )}
        </div>
      ) : (
        <div className="category-table-wrapper panel">
          <table className="category-table">
            <thead>
              <tr>
                <th className="th-order">ORDER</th>
                <th className="th-name">CATEGORY</th>
                <th className="th-commodities">TAGGED COMMODITIES</th>
                <th className="th-status">STATUS</th>
                <th className="th-actions">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((category, index) => {
                const isBusy = data.busyCategoryId === category.id
                return (
                  <tr
                    key={category.id}
                    className={`category-row ${category.status === 'delisted' ? 'is-delisted' : ''}`}
                  >
                    <td className="td-order">
                      {data.isReorderMode ? (
                        <div className="category-order-controls">
                          <button
                            type="button"
                            className="order-btn"
                            disabled={index === 0 || isBusy}
                            onClick={() => void data.handleMoveOrder(index, 'up')}
                            aria-label={`Move ${category.categoryName} up`}
                            title="Move up"
                          >
                            ▲
                          </button>
                          <span className="order-rank">{index + 1}</span>
                          <button
                            type="button"
                            className="order-btn"
                            disabled={index === data.categories.length - 1 || isBusy}
                            onClick={() => void data.handleMoveOrder(index, 'down')}
                            aria-label={`Move ${category.categoryName} down`}
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                      ) : (
                        <span className="order-badge">#{category.displayOrder || index + 1}</span>
                      )}
                    </td>

                    <td className="td-name">
                      <div className="category-name-cell">
                        <strong className="category-primary-name">
                          {category.categoryName}
                        </strong>
                        {category.description ? (
                          <span className="category-description-text">
                            {category.description}
                          </span>
                        ) : (
                          <span className="category-description-muted">
                            No description provided
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="td-commodities">
                      <div className="category-tagged-badge">
                        <Icon name="basket" size={14} />
                        <span>
                          {category.commodityCount}{' '}
                          {category.commodityCount === 1 ? 'commodity' : 'commodities'}
                        </span>
                      </div>
                    </td>

                    <td className="td-status">
                      <span
                        className={`status-indicator-badge ${
                          category.status === 'active' ? 'status-active' : 'status-delisted'
                        }`}
                      >
                        <i className="status-dot" aria-hidden="true" />
                        {category.status === 'active' ? 'Active' : 'Delisted'}
                      </span>
                    </td>

                    <td className="td-actions">
                      <div className="category-action-buttons">
                        <button
                          type="button"
                          className={`category-action-toggle ${
                            category.status === 'active' ? 'is-active-toggle' : 'is-relist-toggle'
                          }`}
                          disabled={isBusy}
                          onClick={() => void data.handleToggleStatus(category)}
                          title={
                            category.status === 'active'
                              ? 'Delist this produce category'
                              : 'Reactivate this produce category'
                          }
                          aria-label={
                            category.status === 'active'
                              ? `Delist ${category.categoryName}`
                              : `Reactivate ${category.categoryName}`
                          }
                        >
                          {category.status === 'active' ? 'Delist' : 'Relist'}
                        </button>

                        <button
                          type="button"
                          className="category-action-edit"
                          disabled={isBusy}
                          onClick={() => data.openEdit(category)}
                          title="Rename and edit category"
                          aria-label={`Edit ${category.categoryName}`}
                        >
                          <Icon name="edit" size={16} />
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
      )}

      <CategoryEditDialog
        editingState={data.editingCategory}
        isSaving={Boolean(data.busyCategoryId)}
        onClose={data.closeEdit}
        onSave={async (payload) => {
          if (data.editingCategory?.isNew) {
            await data.handleCreate(payload)
          } else if (data.editingCategory?.category) {
            await data.handleUpdate(data.editingCategory.category.id, payload)
          }
        }}
      />
    </section>
  )
}
