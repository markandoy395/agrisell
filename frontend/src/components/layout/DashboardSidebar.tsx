import type { AdminProfile, NavigationItem } from '../../types/dashboard'
import { Icon } from '../ui/icon/Icon'
import './DashboardSidebar.css'

const navigation: NavigationItem[] = [
  { label: 'Overview', icon: 'grid' },
  { label: 'Users', icon: 'users' },
  { label: 'Farmers', icon: 'sprout' },
  { label: 'Commodities', icon: 'basket' },
  { label: 'Categories', icon: 'tag' },
  { label: 'Riders', icon: 'rider' },
  { label: 'Orders', icon: 'cart' },
  { label: 'Deliveries', icon: 'truck' },
  { label: 'Safety & SOS', icon: 'shield' },
  { label: 'Customer Support', icon: 'headset' },
  { label: 'Payments', icon: 'card' },
  { label: 'Sales & Discounts', icon: 'trend' },
  { label: 'Reviews', icon: 'star' },
]

type DashboardSidebarProps = {
  activeNav: string
  profile: AdminProfile
  onNavigate: (section: string) => void
  onOpenHelp: () => void
  permissions: string[]
}

const navigationPermission: Record<string, string> = {
  Overview: 'overview:view',
  Users: 'users:manage',
  Farmers: 'farmers:manage',
  Commodities: 'farmers:manage',
  'Products / Commodities': 'farmers:manage',
  Categories: 'farmers:manage',
  'Logistics Companies': 'logistics:manage',
  Riders: 'logistics:manage',
  Orders: 'orders:manage',
  Deliveries: 'logistics:manage',
  'Safety & SOS': 'logistics:manage',
  'Customer Support': 'support:manage',
  Support: 'support:manage',
  Payments: 'payments:view',
  'Sales & Discounts': 'sales:manage',
  Reviews: 'reviews:manage',
}

export function DashboardSidebar({
  activeNav,
  profile,
  onNavigate,
  onOpenHelp,
  permissions,
}: DashboardSidebarProps) {
  const canOpenSettings =
    permissions.includes('settings:manage') || permissions.includes('admin:manage')

  const handleSidebarItemKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const sidebar = e.currentTarget.closest<HTMLElement>('.sidebar')
    if (!sidebar) return

    const navButtons = Array.from(
      sidebar.querySelectorAll<HTMLElement>('.nav-item:not([disabled]), .help-card'),
    )
    const currentIndex = navButtons.indexOf(e.currentTarget)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % navButtons.length
      const target = navButtons[nextIndex]
      target.focus()
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + navButtons.length) % navButtons.length
      const target = navButtons[prevIndex]
      target.focus()
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      // Move focus into the main workspace
      const mainWorkspace = document.querySelector<HTMLElement>('.main-content')
      if (mainWorkspace) {
        const interactive = mainWorkspace.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        const target = Array.from(interactive).find(
          (el) =>
            el.offsetWidth > 0 &&
            el.offsetHeight > 0 &&
            window.getComputedStyle(el).display !== 'none',
        )
        if (target) {
          target.focus()
          target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }
    }
  }

  return (
    <aside className="sidebar" data-sidebar="true">
      <div className="brand">
        <div className="brand-mark">
          <Icon name="leaf" size={24} />
        </div>
        <span>agrisell</span>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {navigation.map((item) => {
          const isDisabled = !permissions.includes(navigationPermission[item.label])
          const isActive =
            activeNav === item.label ||
            (item.label === 'Commodities' && activeNav === 'Products / Commodities') ||
            (item.label === 'Riders' && activeNav === 'Logistics Companies')
          return (
            <button
              className={`nav-item ${isActive ? 'active' : ''}`}
              type="button"
              key={item.label}
              data-nav-item={item.label}
              onClick={() => onNavigate(item.label)}
              onKeyDown={handleSidebarItemKeyDown}
              aria-current={isActive ? 'page' : undefined}
              disabled={isDisabled}
              title={isDisabled ? 'Your administrator role cannot access this section' : undefined}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <span>{item.label}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-bottom">
        <button
          className={`nav-item ${activeNav === 'Settings' ? 'active' : ''}`}
          type="button"
          data-nav-item="Settings"
          onClick={() => onNavigate('Settings')}
          onKeyDown={handleSidebarItemKeyDown}
          disabled={!canOpenSettings}
          title={
            !canOpenSettings ? 'Your administrator role cannot access this section' : undefined
          }
        >
          <span className="nav-icon">
            <Icon name="settings" size={18} />
          </span>
          <span>Settings</span>
        </button>
        <button
          className="help-card"
          type="button"
          onClick={onOpenHelp}
          onKeyDown={handleSidebarItemKeyDown}
        >
          <span className="help-leaf">
            <Icon name="leaf" size={18} />
          </span>
          <span>
            <strong>Need a hand?</strong>
            <small>Visit our help center</small>
          </span>
          <Icon name="arrow" size={17} />
        </button>
        <div className="profile-area">
          <div className="profile-mini">
            <span className={`avatar${profile.avatarUrl ? ' has-photo' : ''}`}>
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.initials}
            </span>
            <span>
              <strong>{profile.name}</strong>
              <small>{profile.role}</small>
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
