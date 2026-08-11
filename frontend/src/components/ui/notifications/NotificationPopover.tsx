import type { NotificationItem } from "../../../types/dashboard";
import { CloseButton } from "../closeButton/CloseButton";
import { Icon } from "../icon/Icon";
import { Tooltip } from "../tooltip/Tooltip";
import "./NotificationPopover.css";

type NotificationPopoverProps = {
  isOpen: boolean;
  notifications: NotificationItem[];
  onToggle: () => void;
  onClose: () => void;
  onMarkAllRead: () => void;
  onHideNotification: (id: string) => void;
};

export function NotificationPopover({
  isOpen,
  notifications,
  onToggle,
  onClose,
  onMarkAllRead,
  onHideNotification,
}: NotificationPopoverProps) {
  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;
  const notificationPanelId = "notifications-panel";

  return (
    <div className="notification-wrap">
      <Tooltip content="Notifications" size="compact">
        <button
          className="icon-button notification-button"
          type="button"
          onClick={onToggle}
          aria-label="Notifications"
          aria-expanded={isOpen}
          aria-controls={notificationPanelId}
          aria-haspopup="dialog"
        >
          <Icon name="bell" size={20} />
          {unreadCount > 0 && (
            <span className="notification-badge" aria-hidden="true">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </Tooltip>
      {isOpen && (
        <section
          id={notificationPanelId}
          className="notifications"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="notifications-heading">
            <div>
              <strong>Notifications</strong>
              <span>
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </span>
            </div>
            <div className="notifications-heading-actions">
              {unreadCount > 0 && (
                <button type="button" onClick={onMarkAllRead}>
                  Mark all as read
                </button>
              )}
              <CloseButton label="Close notifications" onClick={onClose} />
            </div>
          </div>
          {notifications.length > 0 ? (
            <div className="notification-list">
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`notification-item${notification.read ? "" : " unread"}`}
                >
                  <span className="notification-indicator" aria-hidden="true" />
                  <div className="notification-content">
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    <time>{notification.time}</time>
                  </div>
                  <CloseButton
                    className="notification-item-close"
                    label={`Hide ${notification.title} notification`}
                    tooltip="Dismiss notification"
                    tooltipSide="left"
                    onClick={() => onHideNotification(notification.id)}
                  />
                </article>
              ))}
            </div>
          ) : (
            <p className="notifications-empty">You have no notifications.</p>
          )}
        </section>
      )}
    </div>
  );
}
