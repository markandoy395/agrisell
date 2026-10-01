import type { AdminDatabaseData } from '../../types/adminData'
import type { LocationPin, OrderRow } from '../../types/dashboard'

export const SECTION_PERMISSIONS: Record<string, string> = {
  Overview: 'overview:view',
  Users: 'users:manage',
  Farmers: 'farmers:manage',
  Commodities: 'farmers:manage',
  'Products / Commodities': 'farmers:manage',
  Categories: 'farmers:manage',
  Riders: 'logistics:manage',
  Deliveries: 'logistics:manage',
  'Safety & SOS': 'logistics:manage',
  'Customer Support': 'support:manage',
  Support: 'support:manage',
  Orders: 'orders:manage',
  Payments: 'payments:view',
  'Sales & Discounts': 'sales:manage',
  Reviews: 'reviews:manage',
  Settings: 'settings:manage',
  'Logistics Companies': 'logistics:manage',
}

export const getInitialSection = (permissions: string[]) => {
  if (permissions.includes('admin:manage')) return 'Overview'
  const matched =
    Object.entries(SECTION_PERMISSIONS).find(([, permission]) =>
      permissions.includes(permission),
    )?.[0] ?? 'Overview'
  return matched === 'Logistics Companies' ? 'Riders' : matched
}

export const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AD'

export const getPageDescription = (section: string) =>
  section === 'Overview'
    ? 'A live look at your marketplace, farms, and fulfilment.'
    : section === 'Deliveries'
      ? 'Track active delivery routes, riders, checkpoints, and arrival windows.'
      : section === 'Safety & SOS'
        ? 'Real-time emergency monitoring, in-flight incident triage, and safety resolution audit.'
        : section === 'Customer Support' || section === 'Support'
          ? 'Real-time customer support desk, ticket resolution, and live delivery support chats.'
          : section === 'Riders' || section === 'Logistics Companies'
            ? 'Manage individual delivery riders, vehicle details, availability, and verification.'
            : section === 'Commodities' || section === 'Products / Commodities'
              ? 'Manage the marketplace catalog, approve or delist produce, and maintain product descriptions.'
              : section === 'Categories'
                ? 'Create, rename, reorder, and delist produce categories for marketplace discovery and product tagging.'
                : section === 'Settings'
                  ? 'Fine-tune the way your admin workspace works.'
                  : `Monitor and manage your ${section.toLowerCase()} in one place.`

export const shouldShowPageHeading = (section: string) =>
  ![
    'Orders',
    'Users',
    'Farmers',
    'Commodities',
    'Products / Commodities',
    'Categories',
    'Logistics Companies',
    'Riders',
    'Deliveries',
    'Safety & SOS',
    'Customer Support',
    'Support',
    'Payments',
    'Reviews',
    'Sales & Discounts',
  ].includes(section)

export const filterOrders = (orders: OrderRow[], search: string) => {
  const query = search.toLowerCase().trim()
  return query
    ? orders.filter((order) =>
        `${order.id} ${order.customer} ${order.item}`.toLowerCase().includes(query),
      )
    : orders
}

export const createFarmLocationPins = (data: AdminDatabaseData): LocationPin[] => {
  const farmerNameById = new Map(data.farmers.map((farmer) => [farmer.entityId, farmer.primary]))
  return data.farmerFarms
    .filter((farm) => farm.gpsLat !== 0 || farm.gpsLong !== 0)
    .map((farm) => ({
      detail: farm.farmLocation,
      gpsLat: farm.gpsLat,
      gpsLong: farm.gpsLong,
      id: `farm-${farm.id}`,
      kind: 'farm' as const,
      label: farm.farmName,
      owner: farmerNameById.get(farm.farmerId) ?? 'Registered farmer',
      status: farm.status,
      tone: farm.tone,
    }))
}

export const formatRecordModal = (record: {
  category: string
  gpsLat?: number
  gpsLong?: number
  primary: string
  secondary: string
  status: string
  value: string
}) => {
  const gps =
    typeof record.gpsLat === 'number' && typeof record.gpsLong === 'number'
      ? `\n\nGPS location: ${record.gpsLat.toFixed(4)}, ${record.gpsLong.toFixed(4)}`
      : ''
  return {
    message: `${record.secondary}\n\n${record.category}\n${record.value}${gps}\n\nCurrent status: ${record.status}`,
    title: record.primary,
  }
}

export const formatOrderModal = (order: OrderRow) => ({
  message: `${order.customer}\n\n${order.item} - ${order.qty}\nTotal: ${order.total}\n\nCurrent status: ${order.status}`,
  title: `Order ${order.id}`,
})

