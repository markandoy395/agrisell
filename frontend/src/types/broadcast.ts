export type BroadcastTargetSegment = 'all' | 'buyers' | 'farmers' | 'riders'

export type BroadcastNotificationType =
  | 'announcement'
  | 'marketing'
  | 'system_update'
  | 'warning'

export type BroadcastDestination =
  | 'none'
  | 'products'
  | 'orders'
  | 'deliveries'
  | 'account'
  | 'messages'

export type BroadcastPayload = {
  title: string
  message: string
  targetSegment: BroadcastTargetSegment
  notificationType?: BroadcastNotificationType
  destination?: BroadcastDestination
  metadata?: Record<string, unknown>
}

export type BroadcastRecord = {
  broadcastId: string
  id: string
  title: string
  message: string
  targetSegment: BroadcastTargetSegment
  notificationType: BroadcastNotificationType
  destination: BroadcastDestination
  recipientCount: number
  sentByEmail: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type AudienceCounts = {
  all: number
  buyers: number
  farmers: number
  riders: number
}

export type BroadcastHistoryResponse = {
  broadcasts: BroadcastRecord[]
  totalCount: number
}

export type BroadcastSendResponse = {
  broadcast: BroadcastRecord
  recipientCount: number
}
