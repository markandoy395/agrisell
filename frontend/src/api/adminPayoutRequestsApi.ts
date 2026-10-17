import { requestAdminApi } from './adminAuth'

export type AdminPayoutRequest = {
  request_id: string
  user_id: string
  user_role: 'farmer' | 'rider'
  amount: number
  payout_method: 'gcash' | 'bank_transfer'
  account_name: string
  account_number: string
  bank_name: string | null
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  notes: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  requester_name: string
  requester_email?: string | null
  requester_phone?: string | null
  payout_reference?: string | null
  paid_at?: string | null
  requires_reconciliation: boolean
  deliveries: { delivery_id: string; amount: number }[]
}

export type AdminPayoutSummary = {
  total_requests: number
  pending_count: number
  approved_count: number
  paid_count: number
  rejected_count: number
  total_pending_amount: number
  total_paid_amount: number
}

export type AdminPayoutRequestsResponse = {
  summary: AdminPayoutSummary
  requests: AdminPayoutRequest[]
}

export async function fetchAdminPayoutRequests(
  signal?: AbortSignal,
): Promise<AdminPayoutRequestsResponse> {
  const res = (await requestAdminApi('/api/admin/payments/payout-requests', {
    signal,
  })) as Record<string, unknown>

  const rawSummary = (res.summary ?? {}) as Record<string, unknown>
  const summary: AdminPayoutSummary = {
    total_requests: Number(rawSummary.total_requests ?? 0),
    pending_count: Number(rawSummary.pending_count ?? 0),
    approved_count: Number(rawSummary.approved_count ?? 0),
    paid_count: Number(rawSummary.paid_count ?? 0),
    rejected_count: Number(rawSummary.rejected_count ?? 0),
    total_pending_amount: Number(rawSummary.total_pending_amount ?? 0),
    total_paid_amount: Number(rawSummary.total_paid_amount ?? 0),
  }

  const rawRequests = Array.isArray(res.requests) ? res.requests : []
  const requests: AdminPayoutRequest[] = rawRequests.map((item: Record<string, unknown>) => ({
    request_id: String(item.request_id ?? ''),
    user_id: String(item.user_id ?? ''),
    user_role: (item.user_role === 'rider' ? 'rider' : 'farmer') as 'farmer' | 'rider',
    amount: Number(item.amount ?? 0),
    payout_method: (item.payout_method === 'bank_transfer' ? 'bank_transfer' : 'gcash') as
      'gcash' | 'bank_transfer',
    account_name: String(item.account_name ?? ''),
    account_number: String(item.account_number ?? ''),
    bank_name: item.bank_name ? String(item.bank_name) : null,
    status: (['pending', 'approved', 'paid', 'rejected'].includes(String(item.status))
      ? String(item.status)
      : 'pending') as 'pending' | 'approved' | 'paid' | 'rejected',
    notes: item.notes ? String(item.notes) : null,
    rejection_reason: item.rejection_reason ? String(item.rejection_reason) : null,
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
    requester_name: String(item.requester_name ?? 'User'),
    requester_email: item.requester_email ? String(item.requester_email) : null,
    requester_phone: item.requester_phone ? String(item.requester_phone) : null,
    payout_reference: item.payout_reference ? String(item.payout_reference) : null,
    paid_at: item.paid_at ? String(item.paid_at) : null,
    requires_reconciliation: item.requires_reconciliation === true,
    deliveries: Array.isArray(item.deliveries)
      ? item.deliveries.map((row: Record<string, unknown>) => ({
          delivery_id: String(row.delivery_id),
          amount: Number(row.amount),
        }))
      : [],
  }))

  return { summary, requests }
}

export async function updateAdminPayoutRequest(input: {
  request_id: string
  action: 'approve' | 'reject' | 'mark_paid'
  notes?: string
  rejection_reason?: string
  payout_reference?: string
}): Promise<unknown> {
  return requestAdminApi('/api/admin/payments/payout-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
