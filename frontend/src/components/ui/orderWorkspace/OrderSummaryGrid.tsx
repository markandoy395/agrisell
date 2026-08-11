import type { OrderSummaryCard } from "../../../types/dashboard";
import { Icon } from "../icon/Icon";

type OrderSummaryGridProps = {
  cards: OrderSummaryCard[];
};

export function OrderSummaryGrid({ cards }: OrderSummaryGridProps) {
  return (
    <div className="order-summary-grid" aria-label="Order summary">
      {cards.map((card) => (
        <article
          className={`order-summary-card tone-${card.tone}`}
          key={card.label}
        >
          <div className="order-summary-top">
            <span className="order-summary-icon" aria-hidden="true">
              <Icon name={card.icon} size={15} />
            </span>
            <span>{card.label}</span>
            <span className="order-card-menu" aria-hidden="true">
              <Icon name="more" size={16} />
            </span>
          </div>
          <div className="order-summary-value">
            <strong>{card.value}</strong>
            <span className={`order-growth tone-${card.trendTone}`}>
              {card.trend}
              <Icon name="trend" size={11} />
            </span>
          </div>
          <small>{card.detail}</small>
        </article>
      ))}
    </div>
  );
}
