import type { FarmerSummaryCard } from "../../../types/dashboard";
import { Icon } from "../icon/Icon";

type FarmerSummaryGridProps = {
  cards: FarmerSummaryCard[];
};

export function FarmerSummaryGrid({ cards }: FarmerSummaryGridProps) {
  return (
    <div className="user-summary-grid" aria-label="Farmers summary">
      {cards.map((card) => (
        <article className="user-summary-card" key={card.label}>
          <div className="user-summary-top">
            <span className="user-summary-icon" aria-hidden="true">
              <Icon name={card.icon} size={15} />
            </span>
            <span>{card.label}</span>
            <span className="user-card-menu" aria-hidden="true">
              <Icon name="more" size={16} />
            </span>
          </div>
          <div className="user-summary-value">
            <strong>{card.value}</strong>
            <span className="user-growth">
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
