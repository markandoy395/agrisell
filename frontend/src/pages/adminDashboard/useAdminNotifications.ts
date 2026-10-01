import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthenticatedAdmin } from '../../api/adminAuth'
import type { AdminDatabaseData } from '../../types/adminData'
import type { NotificationItem } from '../../types/dashboard'
import { deriveMarketplaceNotifications } from './adminNotificationEvents'
import {
  loadStoredNotificationState,
  mergeNotificationsWithState,
  saveStoredNotificationState,
  type StoredNotificationState,
} from './adminNotificationStorage'

export function useAdminNotifications(
  admin: AuthenticatedAdmin,
  databaseData: AdminDatabaseData | null,
  showToast: (message: string) => void,
) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const storedRef = useRef<StoredNotificationState>({
    customNotifications: [],
    dismissedIds: [],
    readIds: [],
  })

  // Initialize immediately from localStorage so notifications are visible on first render
  const [notifications, setNotificationsState] = useState<NotificationItem[]>(() => {
    const loaded = loadStoredNotificationState(admin.email)
    storedRef.current = loaded
    return mergeNotificationsWithState([], loaded)
  })

  const syncStoredState = useCallback(
    (updater: (prev: StoredNotificationState) => StoredNotificationState) => {
      const next = updater(storedRef.current)
      storedRef.current = next
      saveStoredNotificationState(admin.email, next)
      return next
    },
    [admin.email],
  )

  // Re-derive marketplace events whenever databaseData changes
  useEffect(() => {
    const stored = loadStoredNotificationState(admin.email)
    storedRef.current = stored
    const events = databaseData ? deriveMarketplaceNotifications(databaseData) : []
    setNotificationsState(mergeNotificationsWithState(events, stored))
  }, [admin.email, databaseData])

  const notifyUpdate = useCallback(
    (title: string, message: string) => {
      showToast(message)
      const newItem: NotificationItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message,
        read: false,
        time: 'Just now',
        title,
      }
      const updated = syncStoredState((prev) => ({
        ...prev,
        customNotifications: [newItem, ...prev.customNotifications].slice(0, 12),
      }))
      const events = databaseData ? deriveMarketplaceNotifications(databaseData) : []
      setNotificationsState(mergeNotificationsWithState(events, updated))
    },
    [databaseData, showToast, syncStoredState],
  )

  const markAllNotificationsRead = useCallback(() => {
    const updated = syncStoredState((prev) => {
      const allIds = new Set(prev.readIds)
      notifications.forEach((n) => allIds.add(n.id))
      return {
        ...prev,
        customNotifications: prev.customNotifications.map((c) => ({ ...c, read: true })),
        readIds: Array.from(allIds),
      }
    })
    const events = databaseData ? deriveMarketplaceNotifications(databaseData) : []
    setNotificationsState(mergeNotificationsWithState(events, updated))
    showToast('Notifications marked as read.')
  }, [databaseData, notifications, showToast, syncStoredState])

  const hideNotification = useCallback(
    (id: string) => {
      const updated = syncStoredState((prev) => ({
        ...prev,
        customNotifications: prev.customNotifications.filter((c) => c.id !== id),
        dismissedIds: Array.from(new Set([...prev.dismissedIds, id])),
      }))
      const events = databaseData ? deriveMarketplaceNotifications(databaseData) : []
      setNotificationsState(mergeNotificationsWithState(events, updated))
    },
    [databaseData, syncStoredState],
  )

  // Preserves full compatibility with setNotifications((current) => ...)
  const setNotifications = useCallback<
    React.Dispatch<React.SetStateAction<NotificationItem[]>>
  >(
    (action) => {
      setNotificationsState((current) => {
        const next = typeof action === 'function' ? action(current) : action
        const currentIds = new Set(current.map((n) => n.id))
        const nextIds = new Set(next.map((n) => n.id))
        const removedIds = Array.from(currentIds).filter((id) => !nextIds.has(id))
        const newlyReadIds = next.filter((n) => n.read).map((n) => n.id)

        syncStoredState((prev) => ({
          ...prev,
          customNotifications: prev.customNotifications
            .filter((c) => !removedIds.includes(c.id))
            .map((c) => (newlyReadIds.includes(c.id) ? { ...c, read: true } : c)),
          dismissedIds: Array.from(new Set([...prev.dismissedIds, ...removedIds])),
          readIds: Array.from(new Set([...prev.readIds, ...newlyReadIds])),
        }))

        return next
      })
    },
    [syncStoredState],
  )

  return {
    hideNotification,
    markAllNotificationsRead,
    notifications,
    notificationsOpen,
    notifyUpdate,
    setNotifications,
    setNotificationsOpen,
  }
}
