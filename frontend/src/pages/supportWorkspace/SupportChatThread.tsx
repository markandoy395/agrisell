import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type {
  DeliverySupportChat,
  SupportMessage,
  SupportTicketDetailResponse,
} from '../../api/adminSupportApi'

type SupportChatThreadProps = {
  activeTicket: SupportTicketDetailResponse | null
  activeDeliveryChat: DeliverySupportChat | null
  isLoadingDetail: boolean
  isSending: boolean
  isUpdatingStatus: boolean
  onSendReply: (message: string) => Promise<void>
  onReplyDeliveryChat: (message: string) => Promise<void>
  onUpdateStatus: (
    status: string,
    priority?: string,
    notes?: string,
  ) => Promise<void>
}

const QUICK_REPLIES = [
  'We are investigating this for you right now.',
  'Thank you for reaching out, your issue has now been resolved.',
  'Could you please provide your order number and delivery address?',
  'Our dispatch team has contacted the rider regarding your delivery.',
  'A refund has been initiated and will reflect shortly.',
]

export function SupportChatThread({
  activeTicket,
  activeDeliveryChat,
  isLoadingDetail,
  isSending,
  isUpdatingStatus,
  onSendReply,
  onReplyDeliveryChat,
  onUpdateStatus,
}: SupportChatThreadProps) {
  const [replyText, setReplyText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll messages to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeTicket?.messages])

  const handleSend = async () => {
    if (!replyText.trim() || isSending) return
    const text = replyText.trim()
    setReplyText('')

    if (activeTicket) {
      await onSendReply(text)
    } else if (activeDeliveryChat) {
      await onReplyDeliveryChat(text)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleQuickReply = (text: string) => {
    setReplyText((prev) => (prev ? `${prev} ${text}` : text))
  }

  // 1. Empty State
  if (!activeTicket && !activeDeliveryChat) {
    return (
      <div className="support-chat-pane">
        <div className="support-chat-empty">
          <div className="support-chat-empty-icon">
            <Icon name="message" size={32} />
          </div>
          <h3>Select a Conversation</h3>
          <p>
            Choose a customer support ticket or live delivery chat from the inbox on the left to start responding.
          </p>
        </div>
      </div>
    )
  }

  // 2. Delivery Support Chat Mode
  if (activeDeliveryChat) {
    const riderName = activeDeliveryChat.rider_name || 'Delivery Rider'
    return (
      <div className="support-chat-pane">
        <div className="support-thread-header">
          <div className="support-thread-customer-info">
            <div className="support-avatar-circle">
              {riderName.slice(0, 2).toUpperCase()}
            </div>
            <div className="support-customer-details">
              <strong>{riderName}</strong>
              <div className="support-customer-subtext">
                <span className="role-badge rider">Delivery Rider</span>
                <span>•</span>
                <span>Delivery #{activeDeliveryChat.delivery_id}</span>
              </div>
            </div>
          </div>

          <div className="support-thread-controls">
            <span className="status-badge in_progress">Live Dispatch</span>
          </div>
        </div>

        <div className="support-messages-container">
          <div className="support-message-row is-customer">
            <div className="support-message-meta">
              <span>{riderName} (Rider)</span>
              <span>•</span>
              <span>{new Date(activeDeliveryChat.last_activity).toLocaleTimeString()}</span>
            </div>
            <div className="support-bubble">{activeDeliveryChat.last_message}</div>
          </div>
          <div ref={messagesEndRef} />
        </div>

        <div className="support-quick-replies-bar">
          <span className="quick-reply-label">Quick Responses:</span>
          {QUICK_REPLIES.slice(0, 3).map((qr, idx) => (
            <button
              key={idx}
              type="button"
              className="quick-reply-chip"
              onClick={() => handleQuickReply(qr)}
            >
              {qr}
            </button>
          ))}
        </div>

        <div className="support-composer-area">
          <div className="support-composer-input-row">
            <textarea
              className="support-composer-textarea"
              placeholder="Type message to rider…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button
              type="button"
              className="support-composer-send-btn"
              onClick={() => void handleSend()}
              disabled={isSending || !replyText.trim()}
            >
              <Icon name="message" size={16} />
              <span>{isSending ? 'Sending…' : 'Send'}</span>
            </button>
          </div>
          <div className="support-composer-footer">
            <span>Press Enter to send (Shift+Enter for newline)</span>
          </div>
        </div>
      </div>
    )
  }

  // 3. Support Ticket Mode
  const ticket = activeTicket!.ticket
  const messages = activeTicket!.messages ?? []
  const customerInitials =
    ticket?.customer_name
      ?.split(' ')
      .map((p: string) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'CU'
  const isResolved = ticket?.status === 'resolved' || ticket?.status === 'closed'

  return (
    <div className="support-chat-pane">
      {/* Header */}
      <div className="support-thread-header">
        <div className="support-thread-customer-info">
          <div className="support-avatar-circle">{customerInitials}</div>
          <div className="support-customer-details">
            <strong>{ticket?.customer_name}</strong>
            <div className="support-customer-subtext">
              <span className={`role-badge ${(ticket?.user_role || 'buyer').toLowerCase()}`}>
                {ticket?.user_role}
              </span>
              {ticket?.customer_email && (
                <>
                  <span>•</span>
                  <span>{ticket.customer_email}</span>
                </>
              )}
              {ticket?.customer_phone && (
                <>
                  <span>•</span>
                  <span>{ticket.customer_phone}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="support-thread-controls">
          {/* Status Dropdown */}
          <select
            className="support-select"
            value={ticket?.status || 'open'}
            disabled={isUpdatingStatus}
            onChange={(e) => void onUpdateStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_on_customer">Waiting on Customer</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          {/* Priority Dropdown */}
          <select
            className="support-select"
            value={ticket?.priority || 'medium'}
            disabled={isUpdatingStatus}
            onChange={(e) => void onUpdateStatus(ticket?.status || 'open', e.target.value)}
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
            <option value="urgent">Urgent</option>
          </select>

          {/* Quick Resolve Button */}
          {!isResolved && (
            <button
              type="button"
              className="support-resolve-btn"
              disabled={isUpdatingStatus}
              onClick={() => void onUpdateStatus('resolved')}
            >
              Resolve Ticket
            </button>
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div className="support-messages-container">
        {isLoadingDetail && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
            Loading conversation history…
          </div>
        )}

        {messages.length === 0 && !isLoadingDetail && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
            No messages yet in this ticket.
          </div>
        )}

        {messages.map((msg: SupportMessage) => {
          const isUser = msg.sender_role === 'user'
          const rowClass = isUser ? 'is-customer' : 'is-admin'

          return (
            <div key={msg.message_id} className={`support-message-row ${rowClass}`}>
              <div className="support-message-meta">
                <span>{msg.sender_name} ({msg.sender_role})</span>
                <span>•</span>
                <span>
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="support-bubble">{msg.body}</div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies Bar */}
      <div className="support-quick-replies-bar">
        <span className="quick-reply-label">Quick Responses:</span>
        {QUICK_REPLIES.map((qr, idx) => (
          <button
            key={idx}
            type="button"
            className="quick-reply-chip"
            onClick={() => handleQuickReply(qr)}
          >
            {qr}
          </button>
        ))}
      </div>

      {/* Composer Area */}
      <div className="support-composer-area">
        <div className="support-composer-input-row">
          <textarea
            className="support-composer-textarea"
            placeholder="Type reply to customer…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button
            type="button"
            className="support-composer-send-btn"
            onClick={() => void handleSend()}
            disabled={isSending || !replyText.trim()}
          >
            <Icon name="message" size={16} />
            <span>{isSending ? 'Sending…' : 'Send'}</span>
          </button>
        </div>

        <div className="support-composer-footer">
          <span>Press Enter to send (Shift+Enter for newline)</span>
        </div>
      </div>
    </div>
  )
}
