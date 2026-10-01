import type { IconName } from '../../../types/dashboard'

export const PROFILE_PERMISSION_DETAILS: Record<
  string,
  {
    label: string
    description: string
    icon: IconName
  }
> = {
  'overview:view': { label: 'Overview', description: 'Dashboard & reports', icon: 'home' },
  'users:manage': { label: 'Users', description: 'Manage user accounts', icon: 'users' },
  'farmers:manage': { label: 'Farmers', description: 'Manage farmer records', icon: 'sprout' },
  'logistics:manage': {
    label: 'Logistics & Deliveries',
    description: 'Manage deliveries',
    icon: 'truck',
  },
  'orders:manage': { label: 'Orders', description: 'View and manage orders', icon: 'cart' },
  'payments:view': { label: 'Payments', description: 'Track transactions', icon: 'card' },
  'payments:manage': {
    label: 'Financial operations',
    description: 'Manage movement of funds',
    icon: 'shield',
  },
  'sales:manage': { label: 'Sales & Discounts', description: 'Manage promotions', icon: 'trend' },
  'reviews:manage': { label: 'Reviews', description: 'Customer feedback', icon: 'star' },
  'settings:manage': { label: 'Settings', description: 'System configuration', icon: 'settings' },
  'admin:manage': {
    label: 'Administrator Management',
    description: 'Manage system administrators',
    icon: 'shield',
  },
}
