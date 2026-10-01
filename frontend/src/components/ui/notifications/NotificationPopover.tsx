import { useEffect, useState } from 'react'
import type { NotificationItem } from '../../../types/dashboard'
import {
  fetchBroadcastHistory,
  type BroadcastRecord,
} from '../../../api/adminData'
import { CloseButton } from '../closeButton/CloseButton'
import { Icon } from '../icon/Icon'
import { Tooltip } from '../tooltip/Tooltip'
import './NotificationPopover.css'

type NotificationPopoverProps = {
  isOpen: boolean
  notifications: NotificationItem[]
  onToggle: () => void
  onClose: () => void
  onMarkAllRead: () => void
  onHideNotification: (id: string) => void
  onOpenBroadcast?: () => void
}

export function NotificationPopover({
  isOpen,
  notifications,
  onToggle,
  onClose,
  onMarkAllRead,
  onHideNotification,
  onOpenBroadcast,
}: NotificationPopoverProps) {
  const [activeTab, setActiveTab] = useState<'admin' | 'broadcasts'>('admin')
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([])
  const [isLoadingBroadcasts, setIsLoadingBroadcasts] = useState(false)

  const unreadCount = notifications.filter((notification) => !notification.read).length
  const notificationPanelId = 'notifications-panel'

  useEffect(() => {
    if (!isOpen || activeTab !== 'broadcasts') return
    const controller = new AbortController()
    setIsLoadingBroadcasts(true)
    fetchBroadcastHistory({ limit: 20, signal: controller.signal })
      .then((res) => setBroadcasts(res.broadcasts))
      .catch(() => {})
      .finally(() => setIsLoadingBroadcasts(false))

    return () => controller.abort()
  }, [isOpen, activeTab])

  const formatBroadcastTime = (dateStr: string) => {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="notification-wrap">
      <Tooltip content="Notifications & Announcements" size="compact">
        <button
          className="icon-button notification-button"
          type="button"
          onClick={onToggle}
          aria-label="Notifications & Announcements"
          aria-expanded={isOpen}
          aria-controls={notificationPanelId}
          aria-haspopup="dialog"
        >
          <Icon name="bell" size={20} />
          {unreadCount > 0 && (
            <span className="notification-badge" aria-hidden="true">
              {unreadCount > 9 ? '9+' : unreadCount}
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
            <div className="notifications-heading-title">
              <strong>Notification Center</strong>
              <div className="notifications-tabs">
                <button
                  type="button"
                  className={`notifications-tab-btn${activeTab === 'admin' ? ' active' : ''}`}
                  onClick={() => setActiveTab('admin')}
                >
                  Admin Logs {unreadCount > 0 && `(${unreadCount})`}
                </button>
                <button
                  type="button"
                  className={`notifications-tab-btn${activeTab === 'broadcasts' ? ' active' : ''}`}
                  onClick={() => setActiveTab('broadcasts')}
                >
                  Broadcasts
                </button>
              </div>
            </div>

            <div className="notifications-heading-actions">
              {onOpenBroadcast && (
                <button
                  type="button"
                  className="notifications-broadcast-action-btn"
                  onClick={() => {
                    onClose()
                    onOpenBroadcast()
                  }}
                  title="Broadcast to Mobile Users"
                >
                  <Icon name="broadcast" size={13} />
                  <span>+ Broadcast</span>
                </button>
              )}
              {activeTab === 'admin' && unreadCount > 0 && (
                <button type="button" onClick={onMarkAllRead}>
                  Mark read
                </button>
              )}
              <CloseButton label="Close notifications" onClick={onClose} />
            </div>
          </div>

          {activeTab === 'admin' ? (
            notifications.length > 0 ? (
              <div className="notification-list">
                {notifications.map((notification) => (
                  <article
                    key={notification.id}
                    className={`notification-item${notification.read ? '' : ' unread'}`}
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
              <p className="notifications-empty">You have no pending admin logs.</p>
            )
          ) : (
            /* Broadcasts Tab */
            <div className="notifications-broadcasts-panel">
              {isLoadingBroadcasts ? (
                <p className="notifications-empty">Loading broadcast history...</p>
              ) : broadcasts.length > 0 ? (
                <div className="notification-list">
                  {broadcasts.map((bc) => (
                    <article key={bc.broadcastId || bc.id} className="notification-item broadcast-history-item">
                      <div className="broadcast-history-icon">
                        <Icon name="broadcast" size={14} />
                      </div>
                      <div className="notification-content">
                        <div className="broadcast-history-meta">
                          <span className={`broadcast-history-pill pill-${bc.targetSegment}`}>
                            {bc.targetSegment}
                          </span>
                          <span className="broadcast-history-recipients">
                            {bc.recipientCount} sent
                          </span>
                        </div>
                        <strong>{bc.title}</strong>
                        <p>{bc.message}</p>
                        <time>{formatBroadcastTime(bc.createdAt)}</time>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notifications-empty-broadcasts">
                  <p>No platform announcements have been broadcasted yet.</p>
                  {onOpenBroadcast && (
                    <button
                      type="button"
                      className="notifications-empty-broadcast-btn"
                      onClick={() => {
                        onClose()
                        onOpenBroadcast()
                      }}
                    >
                      <Icon name="broadcast" size={14} />
                      <span>Compose Announcement</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
