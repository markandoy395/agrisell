import { Icon } from '../../components/ui/icon/Icon'
import type {
  DeliverySupportChat,
  MarketplaceConversationSummary,
  SupportFilterTab,
  SupportTicket,
} from '../../api/adminSupportApi'

type SupportInboxListProps = {
  tickets: SupportTicket[]
  deliveryChats: DeliverySupportChat[]
  marketplaceChats?: MarketplaceConversationSummary[]
  selectedTicketId: number | null
  selectedDeliveryConversationId: string | null
  selectedMarketplaceId?: string | null
  search: string
  filter: SupportFilterTab
  onSearchChange: (value: string) => void
  onFilterChange: (filter: SupportFilterTab) => void
  onSelectTicket: (ticketId: number) => void
  onSelectDeliveryChat: (conversationId: string) => void
  onSelectMarketplaceChat?: (conversationId: string) => void
}

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return date.toLocaleDateString()
}

export function SupportInboxList({
  tickets,
  deliveryChats,
  marketplaceChats = [],
  selectedTicketId,
  selectedDeliveryConversationId,
  selectedMarketplaceId,
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onSelectTicket,
  onSelectDeliveryChat,
  onSelectMarketplaceChat,
}: SupportInboxListProps) {
  const showDeliveryChats = filter === 'all' || filter === 'delivery_chats'
  const showTickets =
    filter !== 'delivery_chats' && filter !== 'marketplace_chats' && filter !== 'flagged_chats'
  const showMarketplaceChats =
    filter === 'all' || filter === 'marketplace_chats' || filter === 'flagged_chats'

  const flaggedMarketplaceCount = marketplaceChats.filter(
    (c) =>
      c.moderation_status === 'flagged' ||
      c.moderation_status === 'under_review' ||
      c.moderation_status === 'suspended',
  ).length

  const hasItems =
    (showTickets && tickets.length > 0) ||
    (showDeliveryChats && deliveryChats.length > 0) ||
    (showMarketplaceChats && marketplaceChats.length > 0)

  return (
    <div className="support-inbox-pane">
      <div className="support-inbox-toolbar">
        <label className="support-search-wrapper dashboard-filter-field">
          <span>Search</span>
          <div className="support-search-icon">
            <Icon name="search" size={16} />
          </div>
          <input
            type="text"
            className="support-search-input"
            placeholder="Search tickets, customers, subjects, chat…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>

        <label className="support-filter-field dashboard-filter-field">
          <span>Conversation status</span>
          <select
            value={filter}
            onChange={(event) => onFilterChange(event.target.value as SupportFilterTab)}
          >
            <option value="all">All conversations</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="delivery_chats">Delivery ({deliveryChats.length})</option>
            <option value="marketplace_chats">Marketplace P2P ({marketplaceChats.length})</option>
            <option value="flagged_chats">Flagged ({flaggedMarketplaceCount})</option>
          </select>
        </label>
      </div>

      <div className="support-inbox-list">
        {!hasItems && (
          <div className="support-inbox-empty">
            <strong>No conversations found</strong>
            <p>Try clearing filters or search keywords.</p>
          </div>
        )}

        {/* 1. Support Tickets */}
        {showTickets &&
          tickets.map((ticket) => {
            const isSelected = selectedTicketId === ticket.ticket_id
            const roleClass = (ticket.user_role || 'buyer').toLowerCase()
            const statusClass = (ticket.status || 'open').toLowerCase()
            const priorityClass = (ticket.priority || 'normal').toLowerCase()
            const isUnread = ticket.status === 'open'

            return (
              <div
                key={`ticket-${ticket.ticket_id}`}
                className={`support-ticket-item ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectTicket(ticket.ticket_id)}
                role="button"
                tabIndex={0}
              >
                <div className="support-ticket-item-top">
                  <div className="support-customer-meta">
                    {isUnread && <span className="support-unread-indicator" title="New ticket" />}
                    <span className="support-customer-name">{ticket.customer_name}</span>
                    <span className={`role-badge ${roleClass}`}>{ticket.user_role}</span>
                  </div>
                  <span className="support-ticket-time">
                    {formatRelativeTime(ticket.last_message_time || ticket.created_at)}
                  </span>
                </div>

                <div className="support-ticket-subject">{ticket.subject}</div>

                {ticket.last_message_preview && (
                  <div className="support-ticket-snippet">{ticket.last_message_preview}</div>
                )}

                <div className="support-ticket-item-bottom">
                  <div className="support-ticket-tags">
                    <span className={`status-badge ${statusClass}`}>
                      {ticket.status.replace(/_/g, ' ')}
                    </span>
                    <span className={`priority-badge ${priorityClass}`}>{ticket.priority}</span>
                  </div>
                  <span className="metric-hint" style={{ fontSize: 'var(--fs-xs)' }}>
                    #{ticket.ticket_number || ticket.ticket_id}
                  </span>
                </div>
              </div>
            )
          })}

        {/* 2. In-flight Delivery Support Chats */}
        {showDeliveryChats &&
          deliveryChats.map((chat) => {
            const isSelected = selectedDeliveryConversationId === chat.conversation_id
            const riderDisplayName = chat.rider_name || 'Delivery Rider'

            return (
              <div
                key={`del-${chat.conversation_id}`}
                className={`support-ticket-item ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectDeliveryChat(chat.conversation_id)}
                role="button"
                tabIndex={0}
              >
                <div className="support-ticket-item-top">
                  <div className="support-customer-meta">
                    <span className="support-customer-name">{riderDisplayName}</span>
                    <span className="role-badge rider">Rider</span>
                  </div>
                  <span className="support-ticket-time">
                    {formatRelativeTime(chat.last_activity)}
                  </span>
                </div>

                <div className="support-ticket-subject">
                  In-Flight Delivery Support #{chat.delivery_id}
                </div>

                <div className="support-ticket-snippet">{chat.last_message}</div>

                <div className="support-ticket-item-bottom">
                  <div className="support-ticket-tags">
                    <span className="status-badge in_progress">Active Delivery</span>
                    <span className="priority-badge urgent">Live Dispatch</span>
                  </div>
                  <span className="metric-hint" style={{ fontSize: 'var(--fs-xs)' }}>
                    Order #{chat.order_id || chat.delivery_id}
                  </span>
                </div>
              </div>
            )
          })}

        {/* 3. Peer-to-Peer Marketplace Chats (Buyer ↔ Farmer) */}
        {showMarketplaceChats &&
          marketplaceChats.map((chat) => {
            const isSelected = selectedMarketplaceId === chat.conversation_id
            const modStatus = chat.moderation_status || 'active'
            const isSuspect = modStatus === 'flagged' || modStatus === 'under_review' || modStatus === 'suspended'

            return (
              <div
                key={`mkt-${chat.conversation_id}`}
                className={`support-ticket-item marketplace-inbox-item ${isSelected ? 'active' : ''} ${
                  isSuspect ? 'is-flagged' : ''
                }`}
                onClick={() => onSelectMarketplaceChat?.(chat.conversation_id)}
                role="button"
                tabIndex={0}
              >
                <div className="support-ticket-item-top">
                  <div className="support-customer-meta">
                    <span className="role-badge marketplace-role-badge">P2P Chat</span>
                    <span className="support-customer-name" title={`Buyer: ${chat.buyer_name}`}>
                      {chat.buyer_name}
                    </span>
                    <span className="party-arrow">↔</span>
                    <span className="support-customer-name farmer-highlight" title={`Farmer: ${chat.farmer_name} (${chat.farm_name})`}>
                      {chat.farmer_name}
                    </span>
                  </div>
                  <span className="support-ticket-time">
                    {formatRelativeTime(chat.last_message_at || chat.updated_at)}
                  </span>
                </div>

                <div className="support-ticket-subject">
                  {chat.commodity_name ? (
                    <span>🌾 {chat.commodity_name} {chat.price_per_unit ? `(₱${Number(chat.price_per_unit).toFixed(2)})` : ''}</span>
                  ) : chat.client_order_id ? (
                    <span>📦 Order #{chat.client_order_id}</span>
                  ) : (
                    <span>💬 Direct Farmer Inquiry ({chat.farm_name})</span>
                  )}
                </div>

                {chat.last_message_body && (
                  <div className="support-ticket-snippet">
                    <span className="last-sender-tag">
                      {chat.last_message_sender === 'buyer'
                        ? 'Buyer: '
                        : chat.last_message_sender === 'farmer'
                        ? 'Farmer: '
                        : chat.last_message_sender === 'admin'
                        ? '🛡️ Admin: '
                        : ''}
                    </span>
                    {chat.last_message_body}
                  </div>
                )}

                <div className="support-ticket-item-bottom">
                  <div className="support-ticket-tags">
                    <span className={`status-badge ${modStatus}`}>
                      {modStatus.replace(/_/g, ' ')}
                    </span>
                    {chat.flag_reason && (
                      <span className="priority-badge urgent" title={chat.flag_reason}>
                        {chat.flag_reason.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <span className="metric-hint" style={{ fontSize: 'var(--fs-xs)' }}>
                    {chat.message_count} msg{chat.message_count === 1 ? '' : 's'} • #{chat.conversation_id}
                  </span>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
