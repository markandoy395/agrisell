export type IconName =
  | 'grid'
  | 'users'
  | 'sprout'
  | 'basket'
  | 'cart'
  | 'truck'
  | 'card'
  | 'star'
  | 'settings'
  | 'search'
  | 'bell'
  | 'chevron'
  | 'arrow'
  | 'more'
  | 'calendar'
  | 'trend'
  | 'leaf'

export type Modal = { title: string; message: string } | null

export type EntityRecord = {
  primary: string
  secondary: string
  category: string
  value: string
  status: string
  tone: string
}

export type NavigationItem = {
  label: string
  icon: IconName
  count?: string
}

export type OrderRow = {
  id: string
  customer: string
  initial: string
  item: string
  qty: string
  total: string
  status: string
  tone: string
  time: string
}

export type ChartPoint = {
  date: string
  title: string
  events: string
  change: string
  left: string
  top: string
}

export type EntityInfo = {
  singular: string
  total: string
  description: string
}

export type ModuleHighlight = {
  label: string
  value: string
  detail: string
}
