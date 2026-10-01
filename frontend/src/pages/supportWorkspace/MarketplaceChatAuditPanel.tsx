import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import type {
  MarketplaceAuditMessage,
  MarketplaceConversationDetail,
  MarketplaceFlagReason,
  MarketplaceModerationStatus,
} from '../../api/adminSupportApi'

type MarketplaceChatAuditPanelProps = {
  activeDetail: MarketplaceConversationDetail | null
  isLoadingDetail: boolean
  isModerating: boolean
  isSendingIntervention: boolean
  onModerate: (
    status: MarketplaceModerationStatus,
    flagReason?: MarketplaceFlagReason | null,
    notes?: string | null,
  ) => Promise<void>
  onSendIntervention: (body: string) => Promise<void>
}

const SCAM_TRIGGER_CHIPS = [
  { label: '💸 GCash / Bank', query: 'gcash' },
  { label: '📞 Direct Contact', query: '09' },
  { label: '🚫 Outside App', query: 'outside' },
  { label: '💰 Transfer Direct', query: 'transfer' },
  { label: '⚠️ Cancel Order', query: 'cancel' },
]

const DEFAULT_WARNINGS = [
  'AgriSell Safety Alert: All transactions and payments must be completed through the AgriSell app to stay protected under AgriSell Escrow & Buyer Protection.',
  'AgriSell Policy Notice: Requesting or transferring payments outside the official platform is strictly prohibited and risks permanent account suspension.',
  'Trust & Safety Notice: This conversation is currently under review by platform administrators for policy compliance.',
]

export function MarketplaceChatAuditPanel({
  activeDetail,
  isLoadingDetail,
  isModerating,
  isSendingIntervention,
  onModerate,
  onSendIntervention,
}: MarketplaceChatAuditPanelProps) {
  const [transcriptSearch, setTranscriptSearch] = useState('')
  const [interventionText, setInterventionText] = useState('')
  const [moderationNotes, setModerationNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<MarketplaceModerationStatus>('active')
  const [selectedReason, setSelectedReason] = useState<MarketplaceFlagReason | ''>('')
  const [isToolsExpanded, setIsToolsExpanded] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sync initial moderation values when conversation changes
  useEffect(() => {
    if (activeDetail?.conversation) {
      const conv = activeDetail.conversation
      setSelectedStatus(conv.moderation_status || 'active')
      setSelectedReason(conv.flag_reason || '')
      setModerationNotes(conv.moderation_notes || '')
      setTranscriptSearch('')
      setInterventionText('')
    }
  }, [activeDetail?.conversation?.conversation_id])

  // Scroll to bottom on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeDetail?.messages?.length])

  const conversation = activeDetail?.conversation
  const messages = activeDetail?.messages ?? []

  // In-transcript filtering & highlights
  const filteredMessages = useMemo(() => {
    const q = transcriptSearch.toLowerCase().trim()
    if (!q) return messages
    return messages.filter((m: MarketplaceAuditMessage) => m.body.toLowerCase().includes(q))
  }, [messages, transcriptSearch])

  const matchCount = transcriptSearch.trim() ? filteredMessages.length : 0

  const handleApplyQuickSearch = (chipQuery: string) => {
    if (transcriptSearch.toLowerCase() === chipQuery.toLowerCase()) {
      setTranscriptSearch('')
    } else {
      setTranscriptSearch(chipQuery)
    }
  }

  const handleSaveModeration = async () => {
    if (!conversation) return
    await onModerate(
      selectedStatus,
      selectedReason ? (selectedReason as MarketplaceFlagReason) : null,
      moderationNotes.trim() || null,
    )
  }

  const handleSendIntervention = async () => {
    if (!interventionText.trim() || isSendingIntervention) return
    const text = interventionText.trim()
    setInterventionText('')
    await onSendIntervention(text)
  }

  const handleQuickIntervention = (warning: string) => {
    setInterventionText(warning)
  }

  const handleToggleSuspend = async () => {
    if (!conversation) return
    const nextStatus: MarketplaceModerationStatus =
      conversation.moderation_status === 'suspended' ? 'active' : 'suspended'
    setSelectedStatus(nextStatus)
    await onModerate(
      nextStatus,
      selectedReason ? (selectedReason as MarketplaceFlagReason) : (nextStatus === 'suspended' ? 'potential_scam' : null),
      moderationNotes.trim() || null,
    )
  }

  if (isLoadingDetail) {
    return (
      <div className="support-chat-pane">
        <div className="marketplace-audit-loading">
          <div className="support-loading-spinner" />
          <p>Loading marketplace conversation transcript & audit history…</p>
        </div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="support-chat-pane">
        <div className="support-chat-empty">
          <div className="support-chat-empty-icon">
            <Icon name="message" size={36} />
          </div>
          <h3>Select a Marketplace Conversation</h3>
          <p>
            Choose a buyer-farmer conversation from the inbox on the left to inspect transcripts,
            search for off-platform payment attempts, or take moderation actions.
          </p>
        </div>
      </div>
    )
  }

  const isSuspended = conversation.moderation_status === 'suspended'
  const isFlagged = conversation.moderation_status === 'flagged' || conversation.moderation_status === 'under_review'

  return (
    <div className="support-chat-pane marketplace-audit-pane">
      {/* 1. Header: Context & Participant Information */}
      <div className="marketplace-audit-header">
        <div className="marketplace-audit-title-bar">
          <div className="marketplace-audit-title-left">
            <span className="marketplace-audit-badge">
              <Icon name="shield" size={12} />
              P2P MARKETPLACE AUDIT #{conversation.conversation_id}
            </span>
            <div className="marketplace-audit-parties">
              <span className="party-name buyer" title={`User ID: ${conversation.buyer_user_id}`}>
                {conversation.buyer_name} <small>(Buyer)</small>
              </span>
              <span className="party-separator">↔</span>
              <span className="party-name farmer" title={`Farmer ID: ${conversation.farmer_user_id}`}>
                {conversation.farmer_name} <small>({conversation.farm_name})</small>
              </span>
            </div>
          </div>

          <div className="marketplace-audit-status-strip">
            <span className={`status-badge ${conversation.moderation_status}`}>
              {conversation.moderation_status.replace(/_/g, ' ')}
            </span>
            {conversation.flag_reason && (
              <span className="flag-reason-tag">
                {conversation.flag_reason.replace(/_/g, ' ')}
              </span>
            )}
            <button
              type="button"
              className={`audit-tools-toggle-btn ${isToolsExpanded ? 'active' : ''}`}
              onClick={() => setIsToolsExpanded(!isToolsExpanded)}
            >
              <Icon name="trend" size={14} />
              <span>{isToolsExpanded ? 'Hide Moderation' : 'Moderation Tools'}</span>
            </button>
          </div>
        </div>

        {/* Participant & Context Info Cards */}
        <div className="marketplace-audit-context-grid">
          {/* Buyer Details */}
          <div className="context-card">
            <div className="context-card-title">BUYER INFO</div>
            <div className="context-card-body">
              <strong>{conversation.buyer_name}</strong>
              <div className="context-card-meta">
                {conversation.buyer_email && <span>📧 {conversation.buyer_email}</span>}
                {conversation.buyer_phone && <span>📞 {conversation.buyer_phone}</span>}
              </div>
            </div>
          </div>

          {/* Farmer & Farm Details */}
          <div className="context-card">
            <div className="context-card-title">FARMER & FARM</div>
            <div className="context-card-body">
              <strong>{conversation.farmer_name}</strong>
              <div className="context-card-meta">
                <span>🏡 {conversation.farm_name}</span>
                <span>📍 {conversation.farm_location}</span>
                {conversation.farmer_phone && <span>📞 {conversation.farmer_phone}</span>}
              </div>
            </div>
          </div>

          {/* Linked Product or Order */}
          <div className="context-card product-order-card">
            <div className="context-card-title">COMMODITY & ORDER CONTEXT</div>
            <div className="context-card-body">
              {conversation.commodity_name ? (
                <div className="context-product-inline">
                  {conversation.commodity_image_url && (
                    <img
                      src={conversation.commodity_image_url}
                      alt={conversation.commodity_name}
                      className="context-product-thumb"
                    />
                  )}
                  <div>
                    <strong>{conversation.commodity_name}</strong>
                    <div className="context-card-meta">
                      {conversation.price_per_unit && (
                        <span>₱{Number(conversation.price_per_unit).toFixed(2)} / {conversation.unit_type || 'unit'}</span>
                      )}
                      {conversation.client_order_id && (
                        <span>📦 Order #{conversation.client_order_id} ({conversation.order_status})</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : conversation.client_order_id ? (
                <div>
                  <strong>Order #{conversation.client_order_id}</strong>
                  <div className="context-card-meta">
                    <span>Status: {conversation.order_status}</span>
                    {conversation.order_quantity && <span>Qty: {conversation.order_quantity}</span>}
                  </div>
                </div>
              ) : (
                <span className="context-empty-hint">Direct farmer inquiry (No specific order context)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Moderation Tools Drawer (Collapsible / Action Bar) */}
      {(isToolsExpanded || isFlagged || isSuspended) && (
        <div className="marketplace-moderation-drawer">
          <div className="moderation-drawer-header">
            <h4>
              <Icon name="shield" size={16} />
              Conversation Trust & Safety Moderation
            </h4>
            <div className="moderation-drawer-actions">
              <button
                type="button"
                className={`suspend-btn ${isSuspended ? 'unsuspend' : ''}`}
                onClick={handleToggleSuspend}
                disabled={isModerating}
              >
                {isSuspended ? '🔓 Unsuspend Messaging' : '🔒 Suspend Conversation'}
              </button>
            </div>
          </div>

          <div className="moderation-controls-grid">
            <div className="control-group">
              <label htmlFor="mod-status-select">Moderation Status</label>
              <select
                id="mod-status-select"
                className="support-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as MarketplaceModerationStatus)}
                disabled={isModerating}
              >
                <option value="active">Active (Normal)</option>
                <option value="flagged">Flagged (Scam/Abuse Suspected)</option>
                <option value="under_review">Under Investigation</option>
                <option value="suspended">Suspended (Messaging Frozen)</option>
                <option value="resolved">Resolved (Audit Complete)</option>
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="flag-reason-select">Flag Reason / Violation Type</label>
              <select
                id="flag-reason-select"
                className="support-select"
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value as MarketplaceFlagReason | '')}
                disabled={isModerating}
              >
                <option value="">-- Select reason (if flagged) --</option>
                <option value="potential_scam">Potential Payment Scam</option>
                <option value="off_platform_deal">Off-Platform Deal / Escrow Bypass</option>
                <option value="harassment_abuse">Harassment or Abusive Language</option>
                <option value="counterfeit_pricing">Deceptive Pricing / Counterfeit Listing</option>
                <option value="inappropriate_content">Inappropriate Content</option>
                <option value="other">Other Violation</option>
              </select>
            </div>
          </div>

          <div className="control-group notes-group">
            <label htmlFor="mod-notes-input">Internal Moderator Audit Notes (Admin only)</label>
            <textarea
              id="mod-notes-input"
              className="support-notes-textarea"
              placeholder="Document investigation findings, suspicious messages, off-platform payment attempts, or follow-up actions..."
              value={moderationNotes}
              onChange={(e) => setModerationNotes(e.target.value)}
              rows={2}
              disabled={isModerating}
            />
          </div>

          <div className="moderation-drawer-footer">
            <span className="moderation-audit-info">
              {conversation.moderated_at ? (
                <>Last moderated by <strong>{conversation.moderated_by || 'Admin'}</strong> on {new Date(conversation.moderated_at).toLocaleString()}</>
              ) : (
                'No prior moderation recorded for this conversation.'
              )}
            </span>
            <button
              type="button"
              className="support-btn-primary"
              onClick={handleSaveModeration}
              disabled={isModerating}
            >
              {isModerating ? 'Saving Audit…' : 'Save Moderation Status'}
            </button>
          </div>
        </div>
      )}

      {/* 3. In-Transcript Search Toolbar & Rapid Fraud Filters */}
      <div className="transcript-search-toolbar">
        <div className="transcript-search-box">
          <Icon name="search" size={15} />
          <input
            type="text"
            className="transcript-search-input"
            placeholder="Search transcript for keywords, numbers, or terms…"
            value={transcriptSearch}
            onChange={(e) => setTranscriptSearch(e.target.value)}
          />
          {transcriptSearch && (
            <button
              type="button"
              className="transcript-search-clear"
              onClick={() => setTranscriptSearch('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="transcript-chips-row">
          <span className="chips-label">Quick Triggers:</span>
          {SCAM_TRIGGER_CHIPS.map((chip) => {
            const isActive = transcriptSearch.toLowerCase() === chip.query.toLowerCase()
            return (
              <button
                key={chip.query}
                type="button"
                className={`quick-trigger-chip ${isActive ? 'active' : ''}`}
                onClick={() => handleApplyQuickSearch(chip.query)}
              >
                {chip.label}
              </button>
            )
          })}
        </div>

        {transcriptSearch.trim() && (
          <div className="transcript-match-count">
            {matchCount === 0 ? 'No matching messages' : `${matchCount} message${matchCount > 1 ? 's' : ''} found`}
          </div>
        )}
      </div>

      {/* 4. Complete Chronological Messages Transcript */}
      <div className="support-messages-container marketplace-messages-container">
        {isSuspended && (
          <div className="suspended-conversation-banner">
            <Icon name="shield" size={18} />
            <div>
              <strong>Conversation Suspended</strong>
              <p>Messaging has been restricted by an administrator to protect users from fraudulent activity.</p>
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="transcript-empty-state">
            <p>No messages recorded in this conversation yet.</p>
          </div>
        ) : (
          filteredMessages.map((m: MarketplaceAuditMessage) => {
            const isBuyer = m.sender_role === 'buyer'
            const isAdmin = m.sender_role === 'admin'
            const isHighlighted =
              transcriptSearch.trim() &&
              m.body.toLowerCase().includes(transcriptSearch.toLowerCase())

            if (isAdmin) {
              return (
                <div
                  key={m.message_id}
                  className={`admin-intervention-card ${isHighlighted ? 'highlighted' : ''}`}
                >
                  <div className="admin-intervention-header">
                    <span className="admin-badge">
                      <Icon name="shield" size={14} />
                      OFFICIAL ADMIN INTERVENTION
                    </span>
                    <span className="message-time">
                      {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="admin-intervention-body">{m.body}</div>
                </div>
              )
            }

            return (
              <div
                key={m.message_id}
                className={`marketplace-message-row ${isBuyer ? 'is-buyer' : 'is-farmer'} ${
                  isHighlighted ? 'highlighted-row' : ''
                }`}
              >
                <div className="marketplace-message-meta">
                  <span className={`sender-pill ${isBuyer ? 'buyer-pill' : 'farmer-pill'}`}>
                    {isBuyer ? 'Buyer' : 'Farmer'}: {m.sender_name}
                  </span>
                  <span>•</span>
                  <span className="message-time">
                    {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={`support-bubble marketplace-bubble ${isBuyer ? 'buyer-bubble' : 'farmer-bubble'}`}>
                  {m.body}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 5. Official Administrative Warning & Intervention Composer */}
      <div className="marketplace-intervention-composer">
        <div className="intervention-quick-templates">
          <span className="template-label">Preset Safety Notices:</span>
          {DEFAULT_WARNINGS.map((warn, i) => (
            <button
              key={i}
              type="button"
              className="template-chip"
              onClick={() => handleQuickIntervention(warn)}
              title={warn}
            >
              Notice #{i + 1}
            </button>
          ))}
        </div>

        <div className="intervention-input-row">
          <textarea
            className="support-composer-textarea intervention-textarea"
            placeholder="Post official safety warning or moderation notice into this conversation transcript…"
            value={interventionText}
            onChange={(e) => setInterventionText(e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className="intervention-send-btn"
            onClick={handleSendIntervention}
            disabled={isSendingIntervention || !interventionText.trim()}
          >
            <Icon name="shield" size={16} />
            <span>{isSendingIntervention ? 'Posting…' : 'Post Warning'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
