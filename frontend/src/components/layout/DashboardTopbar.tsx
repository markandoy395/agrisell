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
  onSignOut,
}: DashboardTopbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
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
        <div className="top-profile-area">
          <Tooltip content="Profile menu">
            <button
              className={`top-avatar${profile.avatarUrl ? " has-photo" : ""}`}
              type="button"
              onClick={onToggleProfile}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              aria-controls="top-profile-menu"
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" />
              ) : (
                profile.initials
              )}
            </button>
          </Tooltip>
          {profileOpen && (
            <div id="top-profile-menu" className="top-profile-menu" role="menu">
              <div className="top-profile-summary">
                <strong>{profile.name}</strong>
                <span>{profile.role}</span>
              </div>
              <button type="button" role="menuitem" onClick={onOpenProfile}>
                Profile information
              </button>
              <button type="button" role="menuitem" onClick={onOpenPreferences}>
                Account preferences
              </button>
              <button type="button" role="menuitem" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
