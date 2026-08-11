export type EntityRecord = {
  approvalStatus?: string
  approvalTone?: string
  entityId?: string
  primary: string
  secondary: string
  category: string
  value: string
  status: string
  tone: string
  gpsLat?: number
  gpsLong?: number
}

export type EntityRecordField =
  | 'primary'
  | 'secondary'
  | 'category'
  | 'value'
  | 'status'

export type EntityTableColumn = {
  label: string
  field: EntityRecordField
  helperField?: EntityRecordField
  isStatus?: boolean
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
