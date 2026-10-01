import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createSupportTicket,
  fetchMarketplaceConversationDetail,
  fetchMarketplaceConversations,
  fetchSupportHub,
  fetchSupportTicketDetail,
  moderateMarketplaceConversation,
  replyDeliverySupportChat,
  sendMarketplaceIntervention,
  sendSupportReply,
  updateSupportTicket,
  type CreateSupportTicketPayload,
  type DeliverySupportChat,
  type MarketplaceConversationDetail,
  type MarketplaceConversationSummary,
  type MarketplaceFlagReason,
  type MarketplaceModerationStatus,
  type SupportFilterTab,
  type SupportHubResponse,
  type SupportTicket,
  type SupportTicketDetailResponse,
} from '../../api/adminSupportApi'

export function useSupportData(onNotice: (message: string) => void) {
  const [data, setData] = useState<SupportHubResponse>({
    tickets: [],
    delivery_chats: [],
    stats: {
      total: 0,
      open: 0,
      in_progress: 0,
      waiting_on_customer: 0,
      resolved: 0,
      urgent: 0,
      delivery_support_chats: 0,
      marketplace_chats: 0,
      flagged_marketplace_chats: 0,
    },
  })
  const [marketplaceChats, setMarketplaceChats] = useState<MarketplaceConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [filter, setFilter] = useState<SupportFilterTab>('all')
  const [search, setSearch] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [selectedDeliveryConversationId, setSelectedDeliveryConversationId] = useState<string | null>(null)
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<string | null>(null)
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetailResponse | null>(null)
  const [marketplaceDetail, setMarketplaceDetail] = useState<MarketplaceConversationDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isLoadingMarketplaceDetail, setIsLoadingMarketplaceDetail] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isModerating, setIsModerating] = useState(false)
  const [isSendingIntervention, setIsSendingIntervention] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const isMounted = useRef(true)

  const loadHub = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const [hubRes, marketplaceRes] = await Promise.all([
        fetchSupportHub().catch(() => ({
          tickets: [],
          delivery_chats: [],
          stats: {
            total: 0,
            open: 0,
            in_progress: 0,
            waiting_on_customer: 0,
            resolved: 0,
            urgent: 0,
            delivery_support_chats: 0,
            marketplace_chats: 0,
            flagged_marketplace_chats: 0,
          },
        })),
        fetchMarketplaceConversations().catch(() => []),
      ])
      if (isMounted.current) {
        const flaggedCount = marketplaceRes.filter(
          (c) =>
            c.moderation_status === 'flagged' ||
            c.moderation_status === 'under_review' ||
            c.moderation_status === 'suspended',
        ).length

        setData({
          tickets: hubRes.tickets ?? [],
          delivery_chats: hubRes.delivery_chats ?? [],
          stats: {
            ...hubRes.stats,
            delivery_support_chats: hubRes.delivery_chats?.length ?? 0,
            marketplace_chats: marketplaceRes.length,
            flagged_marketplace_chats: flaggedCount,
          },
        })
        setMarketplaceChats(marketplaceRes)
        setLastUpdated(new Date())
      }
    } catch (err) {
      if (!silent) {
        onNotice(err instanceof Error ? err.message : 'Error loading support hub')
      }
    } finally {
      if (isMounted.current && !silent) {
        setIsLoading(false)
      }
    }
  }, [onNotice])

  // Load ticket details when selectedTicketId changes
  const loadTicketDetail = useCallback(async (ticketId: number, silent = false) => {
    if (!silent) setIsLoadingDetail(true)
    try {
      const res = await fetchSupportTicketDetail(ticketId)
      if (isMounted.current) {
        setTicketDetail(res)
      }
    } catch (err) {
      if (!silent) {
        onNotice(err instanceof Error ? err.message : 'Error loading ticket details')
      }
    } finally {
      if (isMounted.current && !silent) {
        setIsLoadingDetail(false)
      }
    }
  }, [onNotice])

  // Load marketplace conversation details
  const loadMarketplaceDetail = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setIsLoadingMarketplaceDetail(true)
    try {
      const res = await fetchMarketplaceConversationDetail(conversationId)
      if (isMounted.current) {
        setMarketplaceDetail(res)
      }
    } catch (err) {
      if (!silent) {
        onNotice(err instanceof Error ? err.message : 'Error loading marketplace conversation detail')
      }
    } finally {
      if (isMounted.current && !silent) {
        setIsLoadingMarketplaceDetail(false)
      }
    }
  }, [onNotice])

  // Initial load
  useEffect(() => {
    isMounted.current = true
    void loadHub()
    return () => {
      isMounted.current = false
    }
  }, [loadHub])

  // Auto-refresh interval (every 10s)
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      void loadHub(true)
      if (selectedTicketId) {
        void loadTicketDetail(selectedTicketId, true)
      }
      if (selectedMarketplaceId) {
        void loadMarketplaceDetail(selectedMarketplaceId, true)
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadHub, loadTicketDetail, loadMarketplaceDetail, selectedTicketId, selectedMarketplaceId])

  // Select ticket
  const handleSelectTicket = useCallback((ticketId: number) => {
    setSelectedTicketId(ticketId)
    setSelectedDeliveryConversationId(null)
    setSelectedMarketplaceId(null)
    setMarketplaceDetail(null)
    void loadTicketDetail(ticketId)
  }, [loadTicketDetail])

  // Select delivery chat
  const handleSelectDeliveryChat = useCallback((conversationId: string) => {
    setSelectedDeliveryConversationId(conversationId)
    setSelectedTicketId(null)
    setSelectedMarketplaceId(null)
    setTicketDetail(null)
    setMarketplaceDetail(null)
  }, [])

  // Select marketplace chat
  const handleSelectMarketplaceChat = useCallback((conversationId: string) => {
    setSelectedMarketplaceId(conversationId)
    setSelectedTicketId(null)
    setSelectedDeliveryConversationId(null)
    setTicketDetail(null)
    void loadMarketplaceDetail(conversationId)
  }, [loadMarketplaceDetail])

  // Auto-select first item if none selected and data loaded
  useEffect(() => {
    if (!selectedTicketId && !selectedDeliveryConversationId && !selectedMarketplaceId && !isLoading) {
      if (filter === 'marketplace_chats' || filter === 'flagged_chats') {
        if (marketplaceChats.length > 0) {
          handleSelectMarketplaceChat(marketplaceChats[0].conversation_id)
        }
      } else if (filter === 'delivery_chats') {
        if (data.delivery_chats.length > 0) {
          handleSelectDeliveryChat(data.delivery_chats[0].conversation_id)
        }
      } else {
        if (data.tickets.length > 0) {
          handleSelectTicket(data.tickets[0].ticket_id)
        } else if (data.delivery_chats.length > 0) {
          handleSelectDeliveryChat(data.delivery_chats[0].conversation_id)
        } else if (marketplaceChats.length > 0) {
          handleSelectMarketplaceChat(marketplaceChats[0].conversation_id)
        }
      }
    }
  }, [
    filter,
    data.tickets,
    data.delivery_chats,
    marketplaceChats,
    isLoading,
    selectedTicketId,
    selectedDeliveryConversationId,
    selectedMarketplaceId,
    handleSelectTicket,
    handleSelectDeliveryChat,
    handleSelectMarketplaceChat,
  ])

  // Send reply to support ticket
  const handleSendReply = useCallback(async (message: string) => {
    if (!selectedTicketId || !message.trim()) return
    setIsSending(true)
    try {
      const res = await sendSupportReply(selectedTicketId, message.trim())
      setTicketDetail(res)
      await loadHub(true)
      onNotice('Support reply sent')
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Error sending reply')
    } finally {
      setIsSending(false)
    }
  }, [selectedTicketId, loadHub, onNotice])

  // Send reply to in-flight delivery support chat
  const handleReplyDeliveryChat = useCallback(async (message: string) => {
    if (!selectedDeliveryConversationId || !message.trim()) return
    setIsSending(true)
    try {
      await replyDeliverySupportChat(selectedDeliveryConversationId, message.trim())
      await loadHub(true)
      onNotice('Delivery support message sent to rider')
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Error sending message')
    } finally {
      setIsSending(false)
    }
  }, [selectedDeliveryConversationId, loadHub, onNotice])

  // Update ticket status / priority
  const handleUpdateStatus = useCallback(async (
    status: string,
    priority?: string,
    notes?: string,
  ) => {
    if (!selectedTicketId) return
    setIsUpdatingStatus(true)
    try {
      const res = await updateSupportTicket(selectedTicketId, { status, priority, notes })
      setTicketDetail(res)
      await loadHub(true)
      onNotice(`Ticket status updated to ${status.replace(/_/g, ' ')}`)
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Error updating ticket')
    } finally {
      setIsUpdatingStatus(false)
    }
  }, [selectedTicketId, loadHub, onNotice])

  // Moderate marketplace conversation
  const handleModerateMarketplace = useCallback(async (
    status: MarketplaceModerationStatus,
    flagReason?: MarketplaceFlagReason | null,
    notes?: string | null,
  ) => {
    if (!selectedMarketplaceId) return
    setIsModerating(true)
    try {
      const res = await moderateMarketplaceConversation(selectedMarketplaceId, {
        status,
        flag_reason: flagReason,
        notes,
      })
      setMarketplaceDetail(res)
      await loadHub(true)
      onNotice(`Conversation status updated to ${status.replace(/_/g, ' ')}`)
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Error moderating conversation')
    } finally {
      setIsModerating(false)
    }
  }, [selectedMarketplaceId, loadHub, onNotice])

  // Send administrative intervention warning into marketplace conversation
  const handleSendMarketplaceIntervention = useCallback(async (body: string) => {
    if (!selectedMarketplaceId || !body.trim()) return
    setIsSendingIntervention(true)
    try {
      await sendMarketplaceIntervention(selectedMarketplaceId, body.trim())
      await loadMarketplaceDetail(selectedMarketplaceId, true)
      await loadHub(true)
      onNotice('Administrative safety warning posted to conversation transcript')
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Error sending intervention')
    } finally {
      setIsSendingIntervention(false)
    }
  }, [selectedMarketplaceId, loadMarketplaceDetail, loadHub, onNotice])

  // Create new ticket
  const handleCreateTicket = useCallback(async (payload: CreateSupportTicketPayload) => {
    try {
      const res = await createSupportTicket(payload)
      setIsCreateModalOpen(false)
      await loadHub(true)
      if (res?.ticket?.ticket_id) {
        handleSelectTicket(res.ticket.ticket_id)
      }
      onNotice('Support ticket created successfully')
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Error creating ticket')
    }
  }, [loadHub, handleSelectTicket, onNotice])

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    if (filter === 'delivery_chats' || filter === 'marketplace_chats' || filter === 'flagged_chats') {
      return []
    }
    const q = search.toLowerCase().trim()
    return data.tickets.filter((t: SupportTicket) => {
      if (filter === 'open' && t.status !== 'open') return false
      if (filter === 'in_progress' && t.status !== 'in_progress') return false
      if (filter === 'resolved' && t.status !== 'resolved' && t.status !== 'closed') return false

      if (q) {
        const matchesSubject = t.subject?.toLowerCase().includes(q)
        const matchesCustomer = t.customer_name?.toLowerCase().includes(q)
        const matchesCategory = t.category?.toLowerCase().includes(q)
        const matchesRole = t.user_role?.toLowerCase().includes(q)
        const matchesNumber = t.ticket_number?.toLowerCase().includes(q)
        if (!matchesSubject && !matchesCustomer && !matchesCategory && !matchesRole && !matchesNumber) {
          return false
        }
      }
      return true
    })
  }, [data.tickets, filter, search])

  // Filtered delivery chats
  const filteredDeliveryChats = useMemo(() => {
    if (filter !== 'all' && filter !== 'delivery_chats') return []
    const q = search.toLowerCase().trim()
    return data.delivery_chats.filter((c: DeliverySupportChat) => {
      if (q) {
        const matchesRider = c.rider_name?.toLowerCase().includes(q)
        const matchesDelivery = String(c.delivery_id).includes(q)
        const matchesMessage = c.last_message?.toLowerCase().includes(q)
        if (!matchesRider && !matchesDelivery && !matchesMessage) return false
      }
      return true
    })
  }, [data.delivery_chats, filter, search])

  // Filtered marketplace chats
  const filteredMarketplaceChats = useMemo(() => {
    if (filter !== 'all' && filter !== 'marketplace_chats' && filter !== 'flagged_chats') return []
    const q = search.toLowerCase().trim()
    return marketplaceChats.filter((c: MarketplaceConversationSummary) => {
      if (
        filter === 'flagged_chats' &&
        c.moderation_status !== 'flagged' &&
        c.moderation_status !== 'under_review' &&
        c.moderation_status !== 'suspended'
      ) {
        return false
      }

      if (q) {
        const matchesBuyer = c.buyer_name?.toLowerCase().includes(q)
        const matchesFarmer = c.farmer_name?.toLowerCase().includes(q)
        const matchesFarm = c.farm_name?.toLowerCase().includes(q)
        const matchesCommodity = c.commodity_name?.toLowerCase().includes(q)
        const matchesOrder = c.client_order_id?.toLowerCase().includes(q)
        const matchesMessage = c.last_message_body?.toLowerCase().includes(q)
        const matchesNotes = c.moderation_notes?.toLowerCase().includes(q)
        const matchesReason = c.flag_reason?.toLowerCase().includes(q)
        const matchesId = c.conversation_id.includes(q)
        if (
          !matchesBuyer &&
          !matchesFarmer &&
          !matchesFarm &&
          !matchesCommodity &&
          !matchesOrder &&
          !matchesMessage &&
          !matchesNotes &&
          !matchesReason &&
          !matchesId
        ) {
          return false
        }
      }
      return true
    })
  }, [marketplaceChats, filter, search])

  // Selected delivery chat object
  const activeDeliveryChat = useMemo(() => {
    if (!selectedDeliveryConversationId) return null
    return data.delivery_chats.find((c: DeliverySupportChat) => c.conversation_id === selectedDeliveryConversationId) ?? null
  }, [data.delivery_chats, selectedDeliveryConversationId])

  return {
    data,
    filteredTickets,
    filteredDeliveryChats,
    filteredMarketplaceChats,
    activeTicketDetail: ticketDetail,
    activeDeliveryChat,
    activeMarketplaceDetail: marketplaceDetail,
    selectedTicketId,
    selectedDeliveryConversationId,
    selectedMarketplaceId,
    isLoading,
    isLoadingDetail,
    isLoadingMarketplaceDetail,
    isSending,
    isUpdatingStatus,
    isModerating,
    isSendingIntervention,
    autoRefresh,
    lastUpdated,
    filter,
    search,
    isCreateModalOpen,
    setFilter,
    setSearch,
    setAutoRefresh,
    setIsCreateModalOpen,
    selectTicket: handleSelectTicket,
    selectDeliveryChat: handleSelectDeliveryChat,
    selectMarketplaceChat: handleSelectMarketplaceChat,
    sendReply: handleSendReply,
    replyDeliveryChat: handleReplyDeliveryChat,
    updateStatus: handleUpdateStatus,
    moderateMarketplace: handleModerateMarketplace,
    sendMarketplaceIntervention: handleSendMarketplaceIntervention,
    createTicket: handleCreateTicket,
    refresh: () => void loadHub(false),
  }
}
