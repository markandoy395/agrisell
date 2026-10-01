import type { NotificationItem } from '../../types/dashboard'

export type StoredNotificationState = {
  readIds: string[]
  dismissedIds: string[]
  customNotifications: NotificationItem[]
}

const STORAGE_PREFIX = 'agrisell_admin_notifications_'

const getStorageKey = (email: string) =>
  `${STORAGE_PREFIX}${encodeURIComponent(email.toLowerCase().trim())}`

export const loadStoredNotificationState = (email: string): StoredNotificationState => {
  if (!email || typeof window === 'undefined') {
    return { readIds: [], dismissedIds: [], customNotifications: [] }
  }
  try {
    const raw = window.localStorage.getItem(getStorageKey(email))
    if (!raw) return { readIds: [], dismissedIds: [], customNotifications: [] }
    const parsed = JSON.parse(raw) as Partial<StoredNotificationState>
    return {
      customNotifications: Array.isArray(parsed.customNotifications)
        ? parsed.customNotifications
        : [],
      dismissedIds: Array.isArray(parsed.dismissedIds) ? parsed.dismissedIds : [],
      readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
    }
  } catch {
    return { readIds: [], dismissedIds: [], customNotifications: [] }
  }
}

export const saveStoredNotificationState = (
  email: string,
  state: StoredNotificationState,
): void => {
  if (!email || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getStorageKey(email), JSON.stringify(state))
  } catch {
    // LocalStorage quota exceeded or disabled; fail silently
  }
}

export const mergeNotificationsWithState = (
  events: NotificationItem[],
  state: StoredNotificationState,
): NotificationItem[] => {
  const readSet = new Set(state.readIds)
  const dismissedSet = new Set(state.dismissedIds)

  const activeCustom = state.customNotifications
    .filter((item) => !dismissedSet.has(item.id))
    .map((item) => ({ ...item, read: item.read || readSet.has(item.id) }))

  const activeEvents = events
    .filter((item) => !dismissedSet.has(item.id))
    .map((item) => ({ ...item, read: item.read || readSet.has(item.id) }))

  // Deduplicate by ID with custom notifications prioritized
  const seenIds = new Set<string>()
  const merged: NotificationItem[] = []

  for (const item of [...activeCustom, ...activeEvents]) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id)
      merged.push(item)
    }
  }

  return merged.slice(0, 16)
}
