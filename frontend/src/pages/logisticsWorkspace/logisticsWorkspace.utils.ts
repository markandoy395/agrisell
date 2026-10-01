import type { EntityRecord } from '../../types/dashboard'

export const ridersPerPage = 10
export const allCompanies = 'All affiliations'
export const allAvailability = 'All availability'

export const getRiderRecordKey = (record: EntityRecord) =>
  record.entityId ?? `${record.primary}-${record.secondary}`

export const getRiderInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'RD'

export type RiderSummaryCard = {
  accentColor: string
  detail: string
  icon: 'rider' | 'trend' | 'truck' | 'users'
  key: 'registered' | 'available' | 'ondelivery' | 'independent'
  label: string
  solidIcon?: boolean
  trend: string
  value: string
}

export const createLogisticsSummaryCards = (riders: EntityRecord[]): RiderSummaryCard[] => {
  const available = riders.filter((rider) => /available/i.test(rider.status))
  const onDelivery = riders.filter((rider) => /on delivery/i.test(rider.status))
  const independent = riders.filter(
    (rider) =>
      rider.category === 'Independent' ||
      rider.category === 'Logistics company not recorded' ||
      !rider.category,
  )
  return [
    {
      accentColor: '#16a34a',
      detail: 'Individual riders registered in the app',
      icon: 'rider',
      key: 'registered',
      label: 'Registered riders',
      solidIcon: false,
      trend: 'Live',
      value: riders.length.toLocaleString('en-US'),
    },
    {
      accentColor: '#f59e0b',
      detail: 'Available for delivery assignment',
      icon: 'trend',
      key: 'available',
      label: 'Available riders',
      solidIcon: false,
      trend: 'Live',
      value: available.length.toLocaleString('en-US'),
    },
    {
      accentColor: '#3b82f6',
      detail: 'Currently handling deliveries',
      icon: 'truck',
      key: 'ondelivery',
      label: 'On delivery',
      solidIcon: true,
      trend: 'Live',
      value: onDelivery.length.toLocaleString('en-US'),
    },
    {
      accentColor: '#ef4444',
      detail: 'Registered as independent delivery riders',
      icon: 'users',
      key: 'independent',
      label: 'Independent riders',
      solidIcon: false,
      trend: 'Live',
      value: independent.length.toLocaleString('en-US'),
    },
  ]
}

export const downloadRidersCsv = (riders: EntityRecord[]) => {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const rows = [
    ['Rider', 'Contact', 'Affiliation', 'Vehicle / deliveries', 'Availability'],
    ...riders.map((rider) => [
      rider.primary,
      rider.secondary,
      rider.category,
      rider.value,
      rider.status,
    ]),
  ]
  const file = new Blob([rows.map((row) => row.map(escape).join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = 'agrisell-riders.csv'
  link.click()
  URL.revokeObjectURL(url)
}
