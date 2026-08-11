import type { IconName } from './icon'

export type NavigationItem = {
  label: string
  icon: IconName
  count?: string
}

export type NotificationItem = {
  id: string
  title: string
  message: string
  time: string
  read: boolean
}

export type AdminProfile = {
  name: string
  email: string
  role: string
  initials: string
  avatarUrl?: string
}
