import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAdminPayoutRequests,
  updateAdminPayoutRequest,
  type AdminPayoutRequest,
  type AdminPayoutSummary,
} from '../../api/adminPayoutRequestsApi'
import { Icon } from '../../components/ui/icon/Icon'
import { PayoutRequestActionModal } from './PayoutRequestActionModal'
import './PayoutRequestsTable.css'

type StatusFilter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected'
type RoleFilter = 'all' | 'farmer' | 'rider'

type PayoutRequestsTableProps = {
  canManage: boolean
  onNotice?: (message: string) => void
}

export function PayoutRequestsTable({ canManage, onNotice }: PayoutRequestsTableProps) {
  const [requests, setRequests] = useState<AdminPayoutRequest[]>([])
  const [summary, setSummary] = useState<AdminPayoutSummary>({
    total_requests: 0,
    pending_count: 0,
    approved_count: 0,
    paid_count: 0,
    rejected_count: 0,
    total_pending_amount: 0,
    total_paid_amount: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  const [activeModal, setActiveModal] = useState<{
    request: AdminPayoutRequest
    mode: 'reject' | 'mark_paid' | 'details'
  } | null>(null)

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const res = await fetchAdminPayoutRequests()
      setRequests(res.requests)
      setSummary(res.summary)
    } catch (err) {
      if (!silent) {
        onNotice?.(err instanceof Error ? err.message : 'Error loading payout requests')
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [onNotice])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleActionSubmit = async (
    action: 'approve' | 'reject' | 'mark_paid',
    data: { notes?: string; rejection_reason?: string },
  ) => {
    if (!activeModal) return
    await updateAdminPayoutRequest({
      request_id: activeModal.request.request_id,
      action,
      ...data,
    })
    onNotice?.(
      action === 'approve'
        ? 'Payout request approved.'
        : action === 'mark_paid'
          ? 'Payout marked as disbursed.'
          : 'Payout request rejected.',
    )
    await loadData(true)
  }

  const handleQuickApprove = async (request: AdminPayoutRequest) => {
    try {
      await updateAdminPayoutRequest({
        request_id: request.request_id,
        action: 'approve',
      })
      onNotice?.(`Payout request for ${request.requester_name} approved.`)
      await loadData(true)
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : 'Failed to approve request')
    }
  }

  const filteredRequests = useMemo(() => {
    const q = search.toLowerCase().trim()
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (roleFilter !== 'all' && r.user_role !== roleFilter) return false
      if (q) {
        const matchesName = r.requester_name.toLowerCase().includes(q)
        const matchesAccount = r.account_number.toLowerCase().includes(q)
        const matchesAccountName = r.account_name.toLowerCase().includes(q)
        const matchesId = r.request_id.toLowerCase().includes(q)
        if (!matchesName && !matchesAccount && !matchesAccountName && !matchesId) return false
      }
      return true
    })
  }, [requests, search, statusFilter, roleFilter])

  return (
    <div className="payout-requests-container">
      {/* 1. Summary Cards */}
      <div className="payout-metrics-grid">
        <div className="payout-metric-card">
          <div className="payout-metric-header">
            <span className="payout-metric-icon is-yellow">
              <Icon name="calendar" size={16} />
            </span>
            <span className="payout-metric-tag is-yellow">Action Required</span>
          </div>
          <span className="payout-metric-value">{summary.pending_count}</span>
          <span className="payout-metric-label">
            Pending Cash-Outs (₱{summary.total_pending_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })})
          </span>
        </div>

        <div className="payout-metric-card">
          <div className="payout-metric-header">
            <span className="payout-metric-icon is-blue">
              <Icon name="check" size={16} />
            </span>
            <span className="payout-metric-tag is-blue">Queued</span>
          </div>
          <span className="payout-metric-value">{summary.approved_count}</span>
          <span className="payout-metric-label">Approved & Ready to Disburse</span>
        </div>

        <div className="payout-metric-card">
          <div className="payout-metric-header">
            <span className="payout-metric-icon is-green">
              <Icon name="card" size={16} />
            </span>
            <span className="payout-metric-tag is-green">Completed</span>
          </div>
          <span className="payout-metric-value">{summary.paid_count}</span>
          <span className="payout-metric-label">
            Disbursed (₱{summary.total_paid_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })})
          </span>
        </div>

        <div className="payout-metric-card">
          <div className="payout-metric-header">
            <span className="payout-metric-icon is-red">
              <Icon name="close" size={16} />
            </span>
            <span className="payout-metric-tag is-red">Declined</span>
          </div>
          <span className="payout-metric-value">{summary.rejected_count}</span>
          <span className="payout-metric-label">Rejected Requests</span>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="payout-filter-bar dashboard-filter-grid">
        <label className="dashboard-filter-field">
          <span>Search</span>
          <span className="payout-search-wrap dashboard-filter-control">
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Requester, account..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
        </label>

        <label className="dashboard-filter-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending ({summary.pending_count})</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label className="payout-role-select-wrap dashboard-filter-field">
          <span>Role</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            aria-label="Filter by role"
          >
            <option value="all">All Roles</option>
            <option value="farmer">Farmers Only</option>
            <option value="rider">Riders Only</option>
          </select>
        </label>

        <div className="dashboard-filter-actions">
          <button
            type="button"
            className="payout-refresh-button"
            onClick={() => void loadData()}
            disabled={isLoading}
            aria-label="Refresh requests"
            title="Refresh"
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>

      {/* 3. Table */}
      <div className="payout-table-wrap">
        {isLoading ? (
          <div className="payout-loading-state">
            <div className="payout-spinner" />
            <p>Loading cash-out requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="payout-empty-state">
            <Icon name="card" size={32} />
            <h4>No cash-out requests found</h4>
            <p>Requests from farmers and riders will appear here.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date & ID</th>
                <th>Requester</th>
                <th>Method</th>
                <th>Account Details</th>
                <th>Amount</th>
                <th>Status</th>
                <th aria-label="Actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
                <tr key={r.request_id}>
                  <td>
                    <strong>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                    <small>{new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · ID: {r.request_id.slice(0, 8)}</small>
                  </td>
                  <td>
                    <div className="payout-user-cell">
                      <strong>{r.requester_name}</strong>
                      <span className={`payout-role-badge is-${r.user_role}`}>
                        {r.user_role.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="payout-method-badge">
                      <Icon name="card" size={13} />
                      {r.payout_method === 'bank_transfer' ? `Bank (${r.bank_name || 'Bank'})` : 'GCash'}
                    </span>
                  </td>
                  <td>
                    <strong>{r.account_name}</strong>
                    <small>{r.account_number}</small>
                  </td>
                  <td>
                    <span className="payout-amount-text">
                      ₱{r.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td>
                    <span className={`payout-status-chip is-${r.status}`}>
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="payout-actions-cell">
                      {canManage && r.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            className="payout-btn-action is-approve"
                            onClick={() => void handleQuickApprove(r)}
                            title="Approve request"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="payout-btn-action is-reject"
                            onClick={() => setActiveModal({ request: r, mode: 'reject' })}
                            title="Reject request"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {canManage && r.status === 'approved' && (
                        <>
                          <button
                            type="button"
                            className="payout-btn-action is-disburse"
                            onClick={() => setActiveModal({ request: r, mode: 'mark_paid' })}
                            title="Mark as paid / disburse"
                          >
                            Mark Paid
                          </button>
                          <button
                            type="button"
                            className="payout-btn-action is-reject"
                            onClick={() => setActiveModal({ request: r, mode: 'reject' })}
                            title="Reject request"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="payout-btn-icon"
                        onClick={() => setActiveModal({ request: r, mode: 'details' })}
                        title="View details"
                        aria-label={`View details for ${r.request_id}`}
                      >
                        <Icon name="eye" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 4. Action / Details Modal */}
      {activeModal && (
        <PayoutRequestActionModal
          request={activeModal.request}
          mode={activeModal.mode}
          onClose={() => setActiveModal(null)}
          onSubmitAction={handleActionSubmit}
        />
      )}
    </div>
  )
}
