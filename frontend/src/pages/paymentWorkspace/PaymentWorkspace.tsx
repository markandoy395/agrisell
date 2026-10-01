import { useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import { PaymentActivity } from './PaymentActivity'
import { PaymentDetailsModal } from './PaymentDetailsModal'
import { PaymentHeaderSummary } from './PaymentHeaderSummary'
import { PaymentManagementPanel } from './PaymentManagementPanel'
import { PaymentTransactions } from './PaymentTransactions'
import { PayoutRequestsTable } from './PayoutRequestsTable'
import type { PaymentWorkspaceProps } from './paymentWorkspace.types'
import { usePaymentWorkspace } from './usePaymentWorkspace'
import './PaymentWorkspace.css'

export function PaymentWorkspace(props: PaymentWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'payments' | 'payout_requests'>('payments')
  const state = usePaymentWorkspace(props)

  return (
    <section className="payment-workspace" aria-label="Payments">
      <PaymentHeaderSummary cards={state.summaryCards} onNotice={props.onNotice} />

      <div className="payment-view-tabs" aria-label="Payment views">
        <button
          type="button"
          className={`payment-view-tab ${activeTab === 'payments' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <Icon name="card" size={15} />
          Order Payments
        </button>
        <button
          type="button"
          className={`payment-view-tab ${activeTab === 'payout_requests' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('payout_requests')}
        >
          <Icon name="sprout" size={15} />
          Cash-Out Requests
        </button>
      </div>

      {activeTab === 'payments' ? (
        <>
          <PaymentActivity
            bars={props.paymentActivityBars}
            methods={state.methodMetrics}
            nextReleaseAmount={state.nextReleaseAmount}
            period={props.period ?? 'This month'}
            settlements={state.settlementItems}
          />
          <PaymentTransactions
            activeOnly={props.activeOnly}
            canManage={props.canManage}
            onToggleFilter={props.onToggleFilter}
            state={state}
          />
          {state.selectedPayment && (
            <PaymentDetailsModal
              payment={state.selectedPayment}
              onClose={() => state.setSelectedPayment(null)}
            />
          )}
          {state.managedPayment && (
            <PaymentManagementPanel
              payment={state.managedPayment}
              onClose={() => state.setManagedPayment(null)}
              onSaved={props.onDataChanged}
              onNotice={props.onNotice}
            />
          )}
        </>
      ) : (
        <PayoutRequestsTable
          canManage={props.canManage}
          onNotice={props.onNotice}
        />
      )}
    </section>
  )
}

