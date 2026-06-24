import { navigation } from '../../data/dashboardMock'
import { Icon } from '../ui/Icon'

type DashboardSidebarProps = {
  activeNav: string
  profileOpen: boolean
  onNavigate: (section: string) => void
  onToggleProfile: () => void
  onOpenHelp: () => void
  onOpenPreferences: () => void
  onSignOut: () => void
}

export function DashboardSidebar({ activeNav, profileOpen, onNavigate, onToggleProfile, onOpenHelp, onOpenPreferences, onSignOut }: DashboardSidebarProps) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><Icon name="leaf" size={24}/></div><span>agrisell</span></div>
    <div className="workspace-label">WORKSPACE</div>
    <nav className="nav-list" aria-label="Main navigation">
      {navigation.map((item) => <button className={`nav-item ${activeNav === item.label ? 'active' : ''}`} key={item.label} onClick={() => onNavigate(item.label)}><Icon name={item.icon} size={19}/><span>{item.label}</span>{item.count && <span className="nav-count">{item.count}</span>}</button>)}
    </nav>
    <div className="sidebar-bottom">
      <button className={`nav-item ${activeNav === 'Settings' ? 'active' : ''}`} onClick={() => onNavigate('Settings')}><Icon name="settings" size={19}/><span>Settings</span></button>
      <button className="help-card" onClick={onOpenHelp}><span className="help-leaf"><Icon name="leaf" size={18}/></span><span><strong>Need a hand?</strong><small>Visit our help center</small></span><Icon name="arrow" size={17}/></button>
      <div className="profile-area">
        <button className="profile-mini" onClick={onToggleProfile}><span className="avatar avatar-photo">AM</span><span><strong>Angela Mendoza</strong><small>Administrator</small></span><Icon name="more" size={18}/></button>
        {profileOpen && <div className="profile-menu"><button onClick={onOpenPreferences}>Account preferences</button><button onClick={onSignOut}>Sign out</button></div>}
      </div>
    </div>
  </aside>
}
