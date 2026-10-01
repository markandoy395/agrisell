import { CreateSupportTicketModal } from './CreateSupportTicketModal'
import { MarketplaceChatAuditPanel } from './MarketplaceChatAuditPanel'
import { SupportChatThread } from './SupportChatThread'
import { SupportHeaderSummary } from './SupportHeaderSummary'
import { SupportInboxList } from './SupportInboxList'
import { useSupportData } from './useSupportData'
import type { UserWorkspaceRow } from '../../types/userWorkspace'
import './SupportWorkspace.css'

type SupportWorkspaceProps = {
  onNotice: (message: string) => void
  users?: UserWorkspaceRow[]
}

export function SupportWorkspace({ onNotice, users = [] }: SupportWorkspaceProps) {
  const data = useSupportData(onNotice)

  return (
    <section className="support-workspace" aria-labelledby="support-center-title">
      {/* 1. Header Summary & Metrics */}
      <SupportHeaderSummary
        stats={data.data.stats}
        filter={data.filter}
        autoRefresh={data.autoRefresh}
        isLoading={data.isLoading}
        lastUpdated={data.lastUpdated}
        onFilterChange={data.setFilter}
        onToggleAutoRefresh={() => data.setAutoRefresh(!data.autoRefresh)}
        onRefresh={data.refresh}
        onOpenCreateTicket={() => data.setIsCreateModalOpen(true)}
      />

      {/* 2. Main Split-View Inbox */}
      <div className="support-main-layout">
        {/* Left Side: Inbox List */}
        <SupportInboxList
          tickets={data.filteredTickets}
          deliveryChats={data.filteredDeliveryChats}
          marketplaceChats={data.filteredMarketplaceChats}
          selectedTicketId={data.selectedTicketId}
          selectedDeliveryConversationId={data.selectedDeliveryConversationId}
          selectedMarketplaceId={data.selectedMarketplaceId}
          search={data.search}
          filter={data.filter}
          onSearchChange={data.setSearch}
          onFilterChange={data.setFilter}
          onSelectTicket={data.selectTicket}
          onSelectDeliveryChat={data.selectDeliveryChat}
          onSelectMarketplaceChat={data.selectMarketplaceChat}
        />

        {/* Right Side: Chat Thread & Resolution OR Marketplace Audit Panel */}
        {data.selectedMarketplaceId ? (
          <MarketplaceChatAuditPanel
            activeDetail={data.activeMarketplaceDetail}
            isLoadingDetail={data.isLoadingMarketplaceDetail}
            isModerating={data.isModerating}
            isSendingIntervention={data.isSendingIntervention}
            onModerate={data.moderateMarketplace}
            onSendIntervention={data.sendMarketplaceIntervention}
          />
        ) : (
          <SupportChatThread
            activeTicket={data.activeTicketDetail}
            activeDeliveryChat={data.activeDeliveryChat}
            isLoadingDetail={data.isLoadingDetail}
            isSending={data.isSending}
            isUpdatingStatus={data.isUpdatingStatus}
            onSendReply={data.sendReply}
            onReplyDeliveryChat={data.replyDeliveryChat}
            onUpdateStatus={data.updateStatus}
          />
        )}
      </div>

      {/* 3. New Ticket Modal Dialog */}
      <CreateSupportTicketModal
        isOpen={data.isCreateModalOpen}
        users={users}
        onClose={() => data.setIsCreateModalOpen(false)}
        onSubmit={data.createTicket}
      />
    </section>
  )
}
