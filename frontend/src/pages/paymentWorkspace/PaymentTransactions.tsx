import { Icon } from '../../components/ui/icon/Icon'
import type { PaymentFilter } from '../../types/dashboard'
import { getPaymentInitials } from '../../utils/paymentWorkspace'
import type { PaymentWorkspaceProps } from './paymentWorkspace.types'
import {
  PAYMENT_FILTERS,
  PAYMENT_PAGE_SIZE,
  type PaymentWorkspaceState,
} from './usePaymentWorkspace'

const AVATAR_TONES = ['red', 'blue', 'purple', 'green', 'gold']

type PaymentTransactionsProps = Pick<
  PaymentWorkspaceProps,
  'activeOnly' | 'canManage' | 'onToggleFilter'
> & { state: PaymentWorkspaceState }

export function PaymentTransactions(props: PaymentTransactionsProps) {
  const { state } = props
  return (
    <section className="payment-panel payment-transactions">
      <div className="payment-panel-heading payment-table-heading">
        <div>
          <span className="payment-kicker">TRANSACTIONS</span>
          <h3>Recent payments</h3>
        </div>
        <div className="payment-filter-row dashboard-filter-grid" aria-label="Payment filters">
          <label className="dashboard-filter-field">
            <span>Status</span>
            <select
              value={state.activeFilter}
              onChange={(event) => {
                state.setActiveFilter(event.target.value as PaymentFilter)
                state.setCurrentPage(1)
              }}
            >
              {PAYMENT_FILTERS.map((filter) => <option key={filter} value={filter}>{filter}</option>)}
            </select>
          </label>
          <div className="dashboard-filter-actions">
            <button
              className={props.activeOnly ? 'is-active' : ''}
              type="button"
              onClick={() => {
                props.onToggleFilter()
                state.setCurrentPage(1)
              }}
            >
              Completed only
            </button>
          </div>
        </div>
      </div>
      <div className="payment-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Payment</th>
              <th>Customer</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Net</th>
              <th>Settlement</th>
              <th>Status</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {state.pagePayments.map((payment, index) => (
              <tr key={payment.id}>
                <td>
                  <strong>{payment.id}</strong>
                  <small>{payment.order}</small>
                </td>
                <td>
                  <span className="payment-customer">
                    <span
                      className={`payment-avatar tone-${AVATAR_TONES[index % AVATAR_TONES.length]}`}
                      aria-hidden="true"
                    >
                      {getPaymentInitials(payment.customer)}
                    </span>
                    <span className="payment-customer-details">
                      <strong>{payment.customer}</strong>
                      <small>{payment.time}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="payment-method-cell">
                    <i aria-hidden="true">
                      <Icon name="card" size={12} />
                    </i>
                    {payment.method}
                  </span>
                </td>
                <td>{payment.amount}</td>
                <td>
                  <strong>{payment.net}</strong>
                  <small>Fee {payment.fee}</small>
                </td>
                <td>
                  <span
                    className={`payment-settlement-status ${/ready/i.test(payment.settlement) ? 'is-ready' : 'is-confirming'}`}
                  >
                    <Icon
                      name={/ready/i.test(payment.settlement) ? 'check' : 'calendar'}
                      size={14}
                    />
                    {payment.settlement}
                  </span>
                </td>
                <td>
                  <span className={`status ${payment.tone}`}>
                    <i aria-hidden="true" />
                    {payment.status}
                  </span>
                </td>
                <td>
                  {props.canManage && (
                    <button
                      className="icon-action-button"
                      type="button"
                      onClick={() => state.setManagedPayment(payment)}
                      aria-label={`Manage ${payment.id}`}
                      title="Financial operations"
                    >
                      <Icon name="settings" size={17} />
                    </button>
                  )}
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => state.setSelectedPayment(payment)}
                    aria-label={`Open ${payment.id}`}
                    title="Open payment"
                  >
                    <Icon name="eye" size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.pagePayments.length && <div className="no-orders">No matching payments found.</div>}
      </div>
      <div className="payment-table-footer">
        <span>
          Showing {(state.activePage - 1) * PAYMENT_PAGE_SIZE + (state.pagePayments.length ? 1 : 0)}{' '}
          to {(state.activePage - 1) * PAYMENT_PAGE_SIZE + state.pagePayments.length} of{' '}
          {state.visiblePayments.length} payments
        </span>
        <nav className="payment-pagination" aria-label="Payment pages">
          <button
            type="button"
            disabled={state.activePage === 1}
            onClick={() => state.setCurrentPage((page) => Math.max(1, page - 1))}
            aria-label="Previous page"
          >
            <Icon name="chevron" size={15} />
          </button>
          {Array.from({ length: state.totalPages }, (_, index) => index + 1).map((page) => (
            <button
              className={state.activePage === page ? 'is-active' : ''}
              type="button"
              key={page}
              onClick={() => state.setCurrentPage(page)}
              aria-current={state.activePage === page ? 'page' : undefined}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            disabled={state.activePage === state.totalPages}
            onClick={() => state.setCurrentPage((page) => Math.min(state.totalPages, page + 1))}
            aria-label="Next page"
          >
            <Icon name="chevron" size={15} />
          </button>
        </nav>
      </div>
    </section>
  )
}
