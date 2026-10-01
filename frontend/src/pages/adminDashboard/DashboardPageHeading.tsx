import { Icon } from '../../components/ui/icon/Icon'
import type { AdminDashboardState } from './useAdminDashboardState'
import { getPageDescription, shouldShowPageHeading } from './adminDashboard.utils'

const PERIODS = ['This week', 'This month', 'Last 30 days', 'This year']

export function DashboardPageHeading({ state }: { state: AdminDashboardState }) {
  if (!shouldShowPageHeading(state.activeNav)) return null
  const pageTitle =
    state.activeNav === 'Overview'
      ? "Here's what's growing today."
      : state.activeNav === 'Logistics Companies'
        ? 'Riders'
        : state.activeNav
  return (
    <section
      className={`page-heading${state.activeNav === 'Overview' ? ' page-heading--overview' : ''}`}
    >
      <div className={state.activeNav === 'Settings' ? 'settings-page-title' : undefined}>
        {state.activeNav === 'Settings' && (
          <span className="settings-page-title-icon">
            <Icon name="settings" size={25} />
          </span>
        )}
        <div>
          <div className="eyebrow">
            {state.activeNav === 'Overview' ? (
              <>
                GOOD MORNING, {state.adminProfile.name.split(' ')[0].toUpperCase()}
                <Icon name="leaf" size={13} />
              </>
            ) : (
              'MANAGEMENT'
            )}
          </div>
          <h1>{pageTitle}</h1>
          <p>{getPageDescription(state.activeNav)}</p>
        </div>
      </div>
      <div className="date-control">
        <button
          className="date-filter"
          type="button"
          onClick={() => state.setPeriodOpen((isOpen) => !isOpen)}
          aria-expanded={state.periodOpen}
          aria-haspopup="menu"
          aria-controls="dashboard-period-menu"
        >
          <Icon name="calendar" size={18} />
          {state.period}
          <Icon name="chevron" size={16} />
        </button>
        {state.periodOpen && (
          <div className="dropdown-menu" id="dashboard-period-menu" role="menu">
            {PERIODS.map((option) => (
              <button
                key={option}
                className={state.period === option ? 'selected' : ''}
                type="button"
                role="menuitem"
                onClick={() => {
                  state.setPeriod(option)
                  state.setPeriodOpen(false)
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
