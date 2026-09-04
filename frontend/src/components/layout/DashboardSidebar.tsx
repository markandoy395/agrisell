import type { AdminProfile, NavigationItem } from "../../types/dashboard";
import { Icon } from "../ui/icon/Icon";
import "./DashboardSidebar.css";

const navigation: NavigationItem[] = [
  { label: "Overview", icon: "grid" },
  { label: "Users", icon: "users" },
  { label: "Farmers", icon: "sprout" },
  { label: "Logistics Companies", icon: "rider" },
  { label: "Orders", icon: "cart" },
  { label: "Deliveries", icon: "truck" },
  { label: "Payments", icon: "card" },
  { label: "Sales & Discounts", icon: "trend" },
  { label: "Reviews", icon: "star" },
];

type DashboardSidebarProps = {
  activeNav: string;
  profile: AdminProfile;
  onNavigate: (section: string) => void;
  onOpenHelp: () => void;
  permissions: string[];
};

const navigationPermission: Record<string, string> = {
  Overview: "overview:view",
  Users: "users:manage",
  Farmers: "farmers:manage",
  "Logistics Companies": "logistics:manage",
  Orders: "orders:manage",
  Deliveries: "logistics:manage",
  Payments: "payments:view",
  "Sales & Discounts": "sales:manage",
  Reviews: "reviews:manage",
};

export function DashboardSidebar({
  activeNav,
  profile,
  onNavigate,
  onOpenHelp,
  permissions,
}: DashboardSidebarProps) {
  const canOpenSettings = permissions.includes("settings:manage") || permissions.includes("admin:manage");
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Icon name="leaf" size={24} />
        </div>
        <span>agrisell</span>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {navigation.map((item) => {
          const isDisabled = !permissions.includes(navigationPermission[item.label]);
          return (
            <button
              className={`nav-item ${activeNav === item.label ? "active" : ""}`}
              type="button"
              key={item.label}
              onClick={() => onNavigate(item.label)}
              aria-current={activeNav === item.label ? "page" : undefined}
              disabled={isDisabled}
              title={isDisabled ? "Your administrator role cannot access this section" : undefined}
            >
              <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
              <span>{item.label}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <button
          className={`nav-item ${activeNav === "Settings" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("Settings")}
          disabled={!canOpenSettings}
          title={!canOpenSettings ? "Your administrator role cannot access this section" : undefined}
        >
          <span className="nav-icon"><Icon name="settings" size={18} /></span>
          <span>Settings</span>
        </button>
        <button className="help-card" type="button" onClick={onOpenHelp}>
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
            <span className={`avatar${profile.avatarUrl ? " has-photo" : ""}`}>
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" />
              ) : (
                profile.initials
              )}
            </span>
            <span>
              <strong>{profile.name}</strong>
              <small>{profile.role}</small>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
