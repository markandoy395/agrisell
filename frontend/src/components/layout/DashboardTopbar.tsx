import { Icon } from '../ui/Icon'

type DashboardTopbarProps = {
  activeNav: string
  search: string
  notificationsOpen: boolean
  hasNotifications: boolean
  onSearchChange: (value: string) => void
  onToggleNotifications: () => void
  onMarkNotificationsRead: () => void
  onToggleProfile: () => void
}

export function DashboardTopbar({ activeNav, search, notificationsOpen, hasNotifications, onSearchChange, onToggleNotifications, onMarkNotificationsRead, onToggleProfile }: DashboardTopbarProps) {
  const placeholder = activeNav === 'Overview' ? 'Search orders, customers, produce...' : `Search ${activeNav.toLowerCase()}...`

  return <header className="topbar">
    <div className="mobile-brand"><div className="brand-mark"><Icon name="leaf" size={20}/></div>agrisell</div>
    <label className="search-box"><Icon name="search" size={19}/><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder}/><kbd>Ctrl K</kbd></label>
    <div className="top-actions">
      <div className="notification-wrap">
        <button className="icon-button notification-button" onClick={onToggleNotifications} aria-label="Notifications"><Icon name="bell" size={20}/>{hasNotifications && <i/>}</button>
        {notificationsOpen && <div className="notifications"><strong>Notifications</strong><p>3 new orders are ready for review.</p><button onClick={onMarkNotificationsRead}>Mark all as read</button></div>}
      </div>
      <button className="top-avatar" onClick={onToggleProfile} aria-label="Open profile menu">AM</button>
    </div>
  </header>
}
