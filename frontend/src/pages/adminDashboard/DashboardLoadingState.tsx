export function DashboardLoadingState() {
  return (
    <section
      className="dashboard-skeleton"
      aria-busy="true"
      aria-label="Loading Agrisell marketplace data"
    >
      <span className="skeleton-sr-only">Loading Agrisell marketplace data...</span>
      <div className="skeleton-summary-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="skeleton-card" key={index}>
            <i className="skeleton-line skeleton-line-short" />
            <i className="skeleton-line skeleton-line-value" />
            <i className="skeleton-line skeleton-line-medium" />
          </article>
        ))}
      </div>
      <div className="skeleton-content-grid" aria-hidden="true">
        <article className="skeleton-panel skeleton-panel-chart">
          <i className="skeleton-line skeleton-line-title" />
          <i className="skeleton-chart" />
        </article>
        <article className="skeleton-panel">
          <i className="skeleton-line skeleton-line-title" />
          <i className="skeleton-list-line" />
          <i className="skeleton-list-line" />
          <i className="skeleton-list-line skeleton-list-line-last" />
        </article>
      </div>
      <article className="skeleton-panel skeleton-table" aria-hidden="true">
        <i className="skeleton-line skeleton-line-title" />
        {Array.from({ length: 4 }, (_, index) => (
          <i className="skeleton-table-row" key={index} />
        ))}
      </article>
    </section>
  )
}
