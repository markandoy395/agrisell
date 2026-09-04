import { useMemo, useState } from "react";
import { Icon } from "../../components/ui/icon/Icon";
import type {
  EntityRecord,
  PaymentCardTone,
  PaymentFilter,
  PaymentMethodMetric,
  PaymentRecord,
  PaymentSettlementItem,
  PaymentSummaryCard,
} from "../../types/dashboard";
import {
  createdRecordToPayment,
  getPaymentInitials,
  paymentToEntityRecord,
} from "../../utils/paymentWorkspace";
import "./PaymentWorkspace.css";

const paymentAvatarTones = ["red", "blue", "purple", "green", "gold"];
const paymentFilters: PaymentFilter[] = ["All", "Completed", "Pending", "Failed"];
const paymentPageSize = 5;
const paymentMethodTones: PaymentCardTone[] = ["green", "lime", "soft", "dark"];

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(amount);

const getPaymentAmount = (payment: PaymentRecord) => {
  if (typeof payment.amountValue === "number") return payment.amountValue;

  const parsedAmount = Number(payment.amount.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsedAmount) ? parsedAmount : 0;
};

type PaymentWorkspaceProps = {
  paymentActivityBars: number[];
  payments: PaymentRecord[];
  search: string;
  created: EntityRecord[];
  activeOnly: boolean;
  onToggleFilter: () => void;
  onOpen: (record: EntityRecord) => void;
  period?: string;
};

export function PaymentWorkspace({
  paymentActivityBars,
  payments: livePayments,
  search,
  created,
  activeOnly,
  onToggleFilter,
  onOpen,
  period = "This month",
}: PaymentWorkspaceProps) {
  const [activeFilter, setActiveFilter] = useState<PaymentFilter>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const payments = useMemo(
    () => [...created.map(createdRecordToPayment), ...livePayments],
    [created, livePayments],
  );
  const paymentSummaryCards = useMemo<PaymentSummaryCard[]>(() => {
    const completedPayments = payments.filter(
      (payment) => payment.status === "Completed",
    );
    const pendingPayments = payments.filter(
      (payment) => payment.status === "Pending",
    );
    const failedPayments = payments.filter(
      (payment) => payment.status === "Failed",
    );
    const paymentAttemptCount = payments.length;
    const completedAmount = completedPayments.reduce(
      (total, payment) => total + getPaymentAmount(payment),
      0,
    );
    const pendingAmount = pendingPayments.reduce(
      (total, payment) => total + getPaymentAmount(payment),
      0,
    );
    const failedAmount = failedPayments.reduce(
      (total, payment) => total + getPaymentAmount(payment),
      0,
    );
    const successRate =
      paymentAttemptCount === 0
        ? 0
        : Math.round((completedPayments.length / paymentAttemptCount) * 1000) /
          10;

    return [
      {
        detail: "Completed payment collections",
        icon: "card",
        label: "Collected",
        tone: "green",
        trend: "Live",
        value: formatMoney(completedAmount),
      },
      {
        detail: "Awaiting confirmation",
        icon: "calendar",
        label: "Pending",
        tone: "lime",
        trend: "Live",
        value: formatMoney(pendingAmount),
      },
      {
        detail: "Completed payment attempts",
        icon: "trend",
        label: "Success rate",
        tone: "soft",
        trend: "Live",
        value: `${successRate}%`,
      },
      {
        detail: "Failed payment attempts",
        icon: "close",
        label: "Exceptions",
        tone: "dark",
        trend: `${failedPayments.length} open`,
        value: formatMoney(failedAmount),
      },
    ];
  }, [payments]);
  const paymentMethodMetrics = useMemo<PaymentMethodMetric[]>(() => {
    const totalByMethod = payments.reduce<Map<string, number>>(
      (totals, payment) => {
        const method = payment.method || "Not set";
        totals.set(method, (totals.get(method) ?? 0) + getPaymentAmount(payment));
        return totals;
      },
      new Map(),
    );
    const total = Array.from(totalByMethod.values()).reduce(
      (sum, amount) => sum + amount,
      0,
    );

    return Array.from(totalByMethod.entries())
      .sort(([, currentAmount], [, nextAmount]) => nextAmount - currentAmount)
      .slice(0, paymentMethodTones.length)
      .map(([label, amount], index) => ({
        label,
        percent: total === 0 ? 0 : Math.round((amount / total) * 100),
        tone: paymentMethodTones[index],
        value: formatMoney(amount),
      }));
  }, [payments]);
  const paymentSettlementItems = useMemo<PaymentSettlementItem[]>(() => {
    const completedAmount = payments
      .filter((payment) => payment.status === "Completed")
      .reduce((total, payment) => total + getPaymentAmount(payment), 0);
    const pendingAmount = payments
      .filter((payment) => payment.status === "Pending")
      .reduce((total, payment) => total + getPaymentAmount(payment), 0);

    return [
      {
        amount: formatMoney(completedAmount),
        label: "Completed collections",
        schedule: "Ready for settlement review",
      },
      {
        amount: formatMoney(pendingAmount),
        label: "Pending collections",
        schedule: "Awaiting payment confirmation",
      },
    ];
  }, [payments]);
  const nextReleaseAmount = payments
    .filter((payment) => payment.status === "Completed")
    .reduce((total, payment) => total + getPaymentAmount(payment), 0);
  const visiblePayments = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return payments.filter((payment) => {
      const matchesFilter =
        activeFilter === "All" || payment.status === activeFilter;
      const matchesCompletedOnly =
        !activeOnly || payment.status === "Completed";
      const matchesSearch =
        !normalizedSearch ||
        `${payment.id} ${payment.order} ${payment.customer} ${payment.method} ${payment.status} ${payment.amount}`
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesFilter && matchesCompletedOnly && matchesSearch;
    });
  }, [activeFilter, activeOnly, payments, search]);
  const totalPages = Math.max(
    1,
    Math.ceil(visiblePayments.length / paymentPageSize),
  );
  const activePage = Math.min(currentPage, totalPages);
  const pagePayments = visiblePayments.slice(
    (activePage - 1) * paymentPageSize,
    activePage * paymentPageSize,
  );
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <section className="payment-workspace" aria-label="Payments">
      <header className="payment-workspace-header">
        <div>
          <span className="payment-kicker">MANAGEMENT</span>
          <h1>Payments</h1>
          <p>Monitor and manage all your payments in one place.</p>
        </div>
        <button className="payment-period-button" type="button">
          <Icon name="calendar" size={15} />
          {period}
          <Icon name="chevron" size={14} />
        </button>
      </header>

      <div className="payment-summary-grid">
        {paymentSummaryCards.map((card) => (
          <article
            className={`payment-summary-card payment-summary-card--${card.tone}`}
            key={card.label}
          >
            <span className="payment-summary-icon">
              <Icon name={card.icon} size={18} />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </div>
            <em>{card.trend}</em>
          </article>
        ))}
      </div>

      <div className="payment-grid">
        <section className="payment-panel payment-activity-panel">
          <div className="payment-panel-heading">
            <div>
              <span className="payment-kicker">LIVE VOLUME</span>
              <h3>Payment activity</h3>
            </div>
            <button className="ghost-button" type="button">
              <Icon name="calendar" size={14} />
              {period}
              <Icon name="chevron" size={13} />
            </button>
          </div>
          <div className="payment-chart" aria-label="Monthly payment volume">
            <div className="payment-chart-y" aria-hidden="true">
              <span>₱300</span><span>₱200</span><span>₱100</span><span>₱0</span>
            </div>
            <div className="payment-bars">
              {paymentActivityBars.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="payment-chart-x" aria-hidden="true">
              <span>May 1</span><span>May 5</span><span>May 10</span><span>May 15</span><span>May 20</span><span>May 25</span><span>May 30</span>
            </div>
          </div>
          <div className="payment-methods" aria-label="Payment methods">
            {paymentMethodMetrics.map((method) => (
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
            <strong>{formatMoney(nextReleaseAmount)}</strong>
            <small>Completed collections pending settlement review.</small>
          </div>
          <div className="payment-settlement-list">
            {paymentSettlementItems.map((item) => (
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

      <section className="payment-panel payment-transactions">
        <div className="payment-panel-heading payment-table-heading">
          <div>
            <span className="payment-kicker">TRANSACTIONS</span>
            <h3>Recent payments</h3>
          </div>
          <div className="payment-filter-row" aria-label="Payment filters">
            {paymentFilters.map((filter) => (
              <button
                className={activeFilter === filter ? "is-active" : ""}
                key={filter}
                type="button"
                onClick={() => {
                  setActiveFilter(filter);
                  setCurrentPage(1);
                }}
              >
                {filter}
              </button>
            ))}
            <button
              className={activeOnly ? "is-active" : ""}
              type="button"
              onClick={() => {
                onToggleFilter();
                setCurrentPage(1);
              }}
            >
              Completed only
            </button>
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
              {pagePayments.map((payment, index) => (
                <tr key={payment.id}>
                  <td>
                    <strong>{payment.id}</strong>
                    <small>{payment.order}</small>
                  </td>
                  <td>
                    <span className="payment-customer">
                      <span
                        className={`payment-avatar tone-${
                          paymentAvatarTones[index % paymentAvatarTones.length]
                        }`}
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
                  <td><span className="payment-method-cell"><i aria-hidden="true"><Icon name="card" size={12} /></i>{payment.method}</span></td>
                  <td>{payment.amount}</td>
                  <td>
                    <strong>{payment.net}</strong>
                    <small>Fee {payment.fee}</small>
                  </td>
                  <td>
                    <span className={`payment-settlement-status ${/ready/i.test(payment.settlement) ? "is-ready" : "is-confirming"}`}>
                      <Icon name={/ready/i.test(payment.settlement) ? "check" : "calendar"} size={14} />
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
                    <button
                      className="icon-action-button"
                      type="button"
                      onClick={() => onOpen(paymentToEntityRecord(payment))}
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
          {pagePayments.length === 0 && (
            <div className="no-orders">No matching payments found.</div>
          )}
        </div>
        <div className="payment-table-footer">
          <span>
            Showing{" "}
            {(activePage - 1) * paymentPageSize + (pagePayments.length ? 1 : 0)}{" "}
            to {(activePage - 1) * paymentPageSize + pagePayments.length} of{" "}
            {visiblePayments.length} payments
          </span>
          <nav className="payment-pagination" aria-label="Payment pages">
            <button
              type="button"
              disabled={activePage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              aria-label="Previous page"
            >
              <Icon name="chevron" size={15} />
            </button>
            {pageNumbers.map((page) => (
              <button
                className={activePage === page ? "is-active" : ""}
                type="button"
                key={page}
                onClick={() => setCurrentPage(page)}
                aria-current={activePage === page ? "page" : undefined}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={activePage === totalPages}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              aria-label="Next page"
            >
              <Icon name="chevron" size={15} />
            </button>
          </nav>
        </div>
      </section>
    </section>
  );
}
