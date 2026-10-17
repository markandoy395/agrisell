import type { AdminPayoutRequest } from '../../api/adminPayoutRequestsApi'

export function PayoutRequestSummary({ request }: { request: AdminPayoutRequest }) {
  const rows = [
    ['Amount', `PHP ${request.amount.toFixed(2)}`],
    [
      'Method',
      request.payout_method === 'gcash' ? 'GCash' : `Bank (${request.bank_name ?? 'Bank'})`,
    ],
    ['Account name', request.account_name],
    ['Account number', request.account_number],
    ['Status', request.status.toUpperCase()],
    ['Payment reference', request.payout_reference],
    ['Paid at', request.paid_at ? new Date(request.paid_at).toLocaleString() : null],
    ['Rejection reason', request.rejection_reason],
    ['Notes', request.notes],
  ]
  return (
    <div className="payout-summary-box">
      {request.requires_reconciliation && (
        <p className="payout-modal-alert is-error">
          This legacy request has no delivery allocations. Reconcile the recorded payment and
          deliveries. Unpaid requests can be rejected so the rider can submit a balance-backed
          request.
        </p>
      )}
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div className="payout-summary-row" key={label}>
            <span>{label}:</span>
            <strong>{value}</strong>
          </div>
        ))}
      {request.deliveries.map((delivery) => (
        <div className="payout-summary-row" key={delivery.delivery_id}>
          <span>Delivery #{delivery.delivery_id}:</span>
          <strong>PHP {delivery.amount.toFixed(2)}</strong>
        </div>
      ))}
    </div>
  )
}
