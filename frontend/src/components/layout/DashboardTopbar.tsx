import { useEffect, useRef } from "react";
import { Icon } from "../ui/icon/Icon";
import { NotificationPopover } from "../ui/notifications/NotificationPopover";
import { Tooltip } from "../ui/tooltip/Tooltip";
import type { AdminProfile, NotificationItem } from "../../types/dashboard";
import "./DashboardTopbar.css";

type DashboardTopbarProps = {
  activeNav: string;
  search: string;
  notificationsOpen: boolean;
  notifications: NotificationItem[];
  onSearchChange: (value: string) => void;
  onToggleNotifications: () => void;
  onMarkNotificationsRead: () => void;
  onHideNotification: (id: string) => void;
  profile: AdminProfile;
  profileOpen: boolean;
  onToggleProfile: () => void;
  onOpenProfile: () => void;
  onOpenPreferences: () => void;
  onOpenHelp: () => void;
  onOpenAccountAction: (action: string) => void;
  onSignOut: () => void;
};

export function DashboardTopbar({
  activeNav,
  search,
  notificationsOpen,
  notifications,
  onSearchChange,
  onToggleNotifications,
  onMarkNotificationsRead,
  onHideNotification,
  profile,
  profileOpen,
  onToggleProfile,
  onOpenProfile,
  onOpenPreferences,
  onOpenHelp,
  onOpenAccountAction,
  onSignOut,
}: DashboardTopbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileAreaRef = useRef<HTMLDivElement>(null);
  const placeholder =
    activeNav === "Overview"
      ? "Search orders, customers, produce..."
      : `Search ${activeNav.toLowerCase()}...`;

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileAreaRef.current?.contains(event.target as Node)) onToggleProfile();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggleProfile();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen, onToggleProfile]);

  return (
    <header className="topbar">
      <div className="mobile-brand">
        <div className="brand-mark">
          <Icon name="leaf" size={20} />
        </div>
        agrisell
      </div>
      <label className="search-box">
        <Icon name="search" size={19} />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          aria-label="Search dashboard"
        />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="top-actions">
        <NotificationPopover
          isOpen={notificationsOpen}
          notifications={notifications}
          onToggle={onToggleNotifications}
          onClose={onToggleNotifications}
          onMarkAllRead={onMarkNotificationsRead}
          onHideNotification={onHideNotification}
        />
        <div className="top-profile-area" ref={profileAreaRef}>
          <Tooltip content="Profile menu">
            <button
              className="top-profile-trigger"
              type="button"
              onClick={onToggleProfile}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              aria-controls="top-profile-menu"
            >
              <span className={`top-avatar${profile.avatarUrl ? " has-photo" : ""}`}>
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" />
                ) : (
                  profile.initials
                )}
              </span>
              <strong>{profile.name}</strong>
              <Icon name="chevron" size={14} />
            </button>
          </Tooltip>
          {profileOpen && (
            <div id="top-profile-menu" className="profile-menu profile-menu--topbar" role="menu" aria-label="Account menu">
              <div className="profile-menu-summary">
                <span className={`profile-menu-avatar${profile.avatarUrl ? " has-photo" : ""}`}>
                  {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.initials}
                </span>
                <span className="profile-menu-identity">
                  <strong>{profile.name}</strong>
                  <small>{profile.role}</small>
                  <small>{profile.email}</small>
                </span>
              </div>
              <div className="profile-menu-group">
                <button type="button" role="menuitem" onClick={onOpenProfile}><Icon name="profile" size={20} /><span>My Profile</span></button>
                <button type="button" role="menuitem" onClick={() => onOpenAccountAction("Change Password")}><Icon name="lock" size={20} /><span>Change Password</span></button>
                <button type="button" role="menuitem" onClick={onOpenPreferences}><Icon name="bell" size={20} /><span>Notification Preferences</span></button>
              </div>
              <div className="profile-menu-group">
                <button type="button" role="menuitem" onClick={onOpenHelp}><Icon name="help" size={20} /><span>Help Center</span></button>
                <button type="button" role="menuitem" onClick={() => onOpenAccountAction("Contact Support")}><Icon name="headset" size={20} /><span>Contact Support</span></button>
                <button type="button" role="menuitem" onClick={() => onOpenAccountAction("Suggest a Feature")}><Icon name="bulb" size={20} /><span>Suggest a Feature</span></button>
              </div>
              <div className="profile-menu-group profile-menu-logout">
                <button type="button" role="menuitem" onClick={onSignOut}><Icon name="logout" size={20} /><span>Log out</span></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
