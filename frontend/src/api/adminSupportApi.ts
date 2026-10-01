import { requestAdminApi } from './adminAuth'

export type SupportTicket = {
  ticket_id: number
  ticket_number: string
  user_id: number
  user_role: 'buyer' | 'farmer' | 'rider' | 'general'
  customer_name: string
  customer_email?: string
  customer_phone?: string
  subject: string
  category: 'order' | 'delivery' | 'payment' | 'account' | 'safety' | 'general'
  status: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assigned_admin?: string
  order_id?: number
  delivery_id?: number
  created_at: string
  updated_at: string
  resolved_at?: string
  message_count: number
  last_message_preview?: string
  last_message_time?: string
  last_sender_role?: 'user' | 'support' | 'system'
}

export type SupportMessage = {
  message_id: number
  ticket_id: number
  sender_role: 'user' | 'support' | 'system'
  sender_name: string
  sender_user_id?: number
  body: string
  attachments?: unknown[]
  created_at: string
}

export type DeliverySupportChat = {
  conversation_id: string
  delivery_id: number
  rider_id?: string
  rider_name?: string
  rider_phone?: string
  last_message: string
  last_activity: string
  last_sender_role: string
  order_id?: number
  delivery_status?: string
}

export type SupportFilterTab =
  | 'all'
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'delivery_chats'
  | 'marketplace_chats'
  | 'flagged_chats'

export type SupportHubStats = {
  total: number
  open: number
  in_progress: number
  waiting_on_customer: number
  resolved: number
  urgent: number
  delivery_support_chats?: number
  marketplace_chats?: number
  flagged_marketplace_chats?: number
}

export type MarketplaceModerationStatus =
  | 'active'
  | 'flagged'
  | 'under_review'
  | 'resolved'
  | 'suspended'

export type MarketplaceFlagReason =
  | 'potential_scam'
  | 'off_platform_deal'
  | 'harassment_abuse'
  | 'counterfeit_pricing'
  | 'inappropriate_content'
  | 'other'

export type MarketplaceConversationSummary = {
  conversation_id: string
  created_at: string
  updated_at: string
  moderation_status: MarketplaceModerationStatus
  flag_reason?: MarketplaceFlagReason | null
  moderation_notes?: string | null
  flagged_at?: string | null
  flagged_by?: string | null
  moderated_at?: string | null
  moderated_by?: string | null
  buyer_user_id: string
  buyer_name: string
  buyer_email?: string | null
  buyer_phone?: string | null
  buyer_image_url?: string | null
  farmer_user_id: string
  farmer_name: string
  farmer_phone?: string | null
  farmer_image_url?: string | null
  farm_id: string
  farm_name: string
  farm_location: string
  commodity_id?: string | null
  commodity_name?: string | null
  commodity_image_url?: string | null
  unit_type?: string | null
  price_per_unit?: number | null
  order_id?: string | null
  client_order_id?: string | null
  order_status?: string | null
  order_quantity?: number | null
  order_unit_price?: number | null
  message_count: number
  last_message_body?: string | null
  last_message_sender?: 'buyer' | 'farmer' | 'admin' | 'system' | null
  last_message_at?: string | null
}

export type MarketplaceAuditMessage = {
  message_id: string
  conversation_id: string
  sender_role: 'buyer' | 'farmer' | 'admin' | 'system'
  sender_name: string
  body: string
  sent_at: string
}

export type MarketplaceConversationDetail = {
  conversation: MarketplaceConversationSummary
  messages: MarketplaceAuditMessage[]
}

export type ModerateMarketplacePayload = {
  status: MarketplaceModerationStatus
  flag_reason?: MarketplaceFlagReason | null
  notes?: string | null
}

export type SupportHubResponse = {
  tickets: SupportTicket[]
  delivery_chats: DeliverySupportChat[]
  stats: SupportHubStats
}

export type SupportTicketDetailResponse = {
  ticket: SupportTicket
  messages: SupportMessage[]
}

export type CreateSupportTicketPayload = {
  userId: number | string
  subject: string
  category: string
  priority?: string
  initialMessage?: string
}

export const fetchSupportHub = async (signal?: AbortSignal): Promise<SupportHubResponse> => {
  const result = (await requestAdminApi('/api/admin/support', { signal })) as SupportHubResponse
  return {
    tickets: Array.isArray(result?.tickets) ? result.tickets : [],
    delivery_chats: Array.isArray(result?.delivery_chats) ? result.delivery_chats : [],
    stats: result?.stats ?? { total: 0, open: 0, in_progress: 0, waiting_on_customer: 0, resolved: 0, urgent: 0 },
  }
}

export const fetchSupportTicketDetail = async (
  ticketId: number | string,
  signal?: AbortSignal,
): Promise<SupportTicketDetailResponse> => {
  return (await requestAdminApi(`/api/admin/support/tickets/${encodeURIComponent(String(ticketId).replace(/\D/g, ''))}`, {
    signal,
  })) as SupportTicketDetailResponse
}

export const sendSupportReply = async (
  ticketId: number | string,
  body: string,
): Promise<SupportTicketDetailResponse> => {
  return (await requestAdminApi('/api/admin/support/reply', {
    method: 'POST',
    body: JSON.stringify({ ticketId, body }),
  })) as SupportTicketDetailResponse
}

export const updateSupportTicket = async (
  ticketId: number | string,
  payload: { status?: string; priority?: string; notes?: string },
): Promise<SupportTicketDetailResponse> => {
  return (await requestAdminApi('/api/admin/support/status', {
    method: 'POST',
    body: JSON.stringify({ ticketId, ...payload }),
  })) as SupportTicketDetailResponse
}

export const createSupportTicket = async (
  payload: CreateSupportTicketPayload,
): Promise<SupportTicketDetailResponse> => {
  return (await requestAdminApi('/api/admin/support/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  })) as SupportTicketDetailResponse
}

export const replyDeliverySupportChat = async (
  conversationId: string,
  body: string,
): Promise<unknown> => {
  return await requestAdminApi('/api/admin/support/reply-delivery-chat', {
    method: 'POST',
    body: JSON.stringify({ conversationId, body }),
  })
}

export const fetchMarketplaceConversations = async (
  filter = 'all',
  search?: string,
  signal?: AbortSignal,
): Promise<MarketplaceConversationSummary[]> => {
  const params = new URLSearchParams()
  if (filter) params.set('filter', filter)
  if (search?.trim()) params.set('search', search.trim())
  const qs = params.toString() ? `?${params.toString()}` : ''
  const result = (await requestAdminApi(`/api/admin/support/marketplace-chats${qs}`, { signal })) as {
    conversations: MarketplaceConversationSummary[]
  }
  return Array.isArray(result?.conversations) ? result.conversations : []
}

export const fetchMarketplaceConversationDetail = async (
  conversationId: string | number,
  signal?: AbortSignal,
): Promise<MarketplaceConversationDetail> => {
  return (await requestAdminApi(
    `/api/admin/support/marketplace-chats/${encodeURIComponent(String(conversationId).replace(/\D/g, ''))}`,
    { signal },
  )) as MarketplaceConversationDetail
}

export const moderateMarketplaceConversation = async (
  conversationId: string | number,
  payload: ModerateMarketplacePayload,
): Promise<MarketplaceConversationDetail> => {
  return (await requestAdminApi(
    `/api/admin/support/marketplace-chats/${encodeURIComponent(String(conversationId).replace(/\D/g, ''))}/moderate`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )) as MarketplaceConversationDetail
}

export const sendMarketplaceIntervention = async (
  conversationId: string | number,
  body: string,
): Promise<MarketplaceAuditMessage> => {
  return (await requestAdminApi(
    `/api/admin/support/marketplace-chats/${encodeURIComponent(String(conversationId).replace(/\D/g, ''))}/intervene`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    },
  )) as MarketplaceAuditMessage
}
