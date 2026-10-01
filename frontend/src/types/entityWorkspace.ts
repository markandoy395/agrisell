export type EntityRecord = {
  abuseFlags?: ReviewAbuseFlag[]
  adminResponse?: string
  adminResponseMode?: 'public' | 'direct'
  approvalStatus?: string
  approvalTone?: string
  entityId?: string
  moderationHistory?: ReviewModerationHistoryItem[]
  moderationVisibility?: 'published' | 'hidden'
  primary: string
  secondary: string
  category: string
  value: string
  status: string
  tone: string
  gpsLat?: number
  gpsLong?: number
  comment?: string
  rating?: number
  referenceLabel?: string
  reviewDate?: string
  reviewedName?: string
  reviewedType?: 'Farmer' | 'Rider'
  reportStatus?: 'none' | 'open' | 'resolved' | 'dismissed'
}

export type ReviewAbuseFlag =
  'spam' | 'harassment' | 'hate_speech' | 'profanity' | 'scam' | 'personal_information' | 'other'

export type ReviewModerationAction =
  | 'hide'
  | 'publish'
  | 'resolve_report'
  | 'dismiss_report'
  | 'reopen_report'
  | 'add_abuse_flag'
  | 'remove_abuse_flag'

export type ReviewModerationHistoryItem = {
  actor: string
  createdAt: string
  eventType: string
  label: string
  message?: string
}

export type EntityRecordField = 'primary' | 'secondary' | 'category' | 'value' | 'status'

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
