import { Icon } from '../../components/ui/icon/Icon'
import type { PaymentMethodMetric, PaymentSettlementItem } from '../../types/dashboard'
import { formatPaymentMoney } from './paymentWorkspace.metrics'

type PaymentActivityProps = {
  bars: number[]
  methods: PaymentMethodMetric[]
  nextReleaseAmount: number
  period: string
  settlements: PaymentSettlementItem[]
}

export function PaymentActivity(props: PaymentActivityProps) {
  return (
    <div className="payment-grid">
      <section className="payment-panel payment-activity-panel">
        <div className="payment-panel-heading">
          <div>
            <span className="payment-kicker">LIVE VOLUME</span>
            <h3>Payment activity</h3>
          </div>
          <button className="ghost-button" type="button">
            <Icon name="calendar" size={14} />
            {props.period}
            <Icon name="chevron" size={13} />
          </button>
        </div>
        <div className="payment-chart" aria-label="Monthly payment volume">
          <div className="payment-chart-y" aria-hidden="true">
            <span>₱300</span>
            <span>₱200</span>
            <span>₱100</span>
            <span>₱0</span>
          </div>
          <div className="payment-bars">
            {props.bars.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="payment-chart-x" aria-hidden="true">
            <span>May 1</span>
            <span>May 5</span>
            <span>May 10</span>
            <span>May 15</span>
            <span>May 20</span>
            <span>May 25</span>
            <span>May 30</span>
          </div>
        </div>
        <div className="payment-methods" aria-label="Payment methods">
          {props.methods.map((method) => (
            <div className="payment-method" key={method.label}>
              <div>
                <strong>{method.label}</strong>
                <span>{method.value}</span>
              </div>
              <div className="payment-method-track">
                <i
                  className={`payment-method-fill payment-method-fill--${method.tone}`}
                  style={{ width: `${method.percent}%` }}
                />
              </div>
              <em>{method.percent}%</em>
            </div>
          ))}
        </div>
      </section>
      <aside className="payment-panel payment-settlement-panel">
        <div className="payment-panel-heading">
          <div>
            <span className="payment-kicker">SETTLEMENTS</span>
            <h3>Release queue</h3>
          </div>
        </div>
        <div className="payment-wallet-card">
          <span>Next release</span>
          <strong>{formatPaymentMoney(props.nextReleaseAmount)}</strong>
          <small>Completed collections pending settlement review.</small>
        </div>
        <div className="payment-settlement-list">
          {props.settlements.map((item) => (
            <article key={item.label}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.schedule}</span>
              </div>
              <em>{item.amount}</em>
            </article>
          ))}
        </div>
      </aside>
    </div>
  )
}
