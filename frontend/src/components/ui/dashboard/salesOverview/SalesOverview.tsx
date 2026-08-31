import { useState } from "react";
import type { SalesTrendPoint } from "../../../../types/adminData";
import { Icon } from "../../icon/Icon";
import "./SalesOverview.css";

const chartWidth = 650;
const chartHeight = 218;
const plotPadding = 8;

const currency = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

const compactCurrency = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

const dateLabel = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
});

const fullDate = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthLabel = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const monthAxisLabel = new Intl.DateTimeFormat("en-PH", { month: "short" });

const parseDate = (value: string) => new Date(`${value}T00:00:00`);

const niceMaximum = (value: number) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return rounded * magnitude;
};

type SalesChartPeriod = "Daily" | "Weekly" | "Monthly";

const aggregateSalesTrend = (
  salesTrend: SalesTrendPoint[],
  period: SalesChartPeriod,
) => {
  if (period === "Daily") return salesTrend.slice(-7);

  if (period === "Weekly") {
    const recentDays = salesTrend.slice(-56);
    return Array.from({ length: Math.ceil(recentDays.length / 7) }, (_, index) => {
      const week = recentDays.slice(index * 7, index * 7 + 7);
      return week.reduce<SalesTrendPoint>(
        (total, point) => ({
          date: point.date,
          orders: total.orders + point.orders,
          revenue: total.revenue + point.revenue,
        }),
        { date: week[0]?.date ?? "", orders: 0, revenue: 0 },
      );
    });
  }

  const months = new Map<string, SalesTrendPoint>();
  salesTrend.forEach((point) => {
    const key = point.date.slice(0, 7);
    const total = months.get(key) ?? {
      date: `${key}-01`,
      orders: 0,
      revenue: 0,
    };
    total.orders += point.orders;
    total.revenue += point.revenue;
    months.set(key, total);
  });
  return [...months.values()].slice(-12);
};

type SalesOverviewProps = {
  metric: string;
  metricOpen: boolean;
  activeChartIndex: number | null;
  salesTrend: SalesTrendPoint[];
  totalOrders: number;
  totalSales: number;
  onToggleMetric: () => void;
  onSelectMetric: (metric: string) => void;
  onChartPointer: (clientX: number, element: HTMLDivElement, pointCount: number) => void;
  onChartLeave: () => void;
};

export function SalesOverview({
  metric,
  metricOpen,
  activeChartIndex,
  salesTrend,
  totalOrders,
  totalSales,
  onToggleMetric,
  onSelectMetric,
  onChartPointer,
  onChartLeave,
}: SalesOverviewProps) {
  const [period, setPeriod] = useState<SalesChartPeriod>("Daily");
  const chartPoints = aggregateSalesTrend(salesTrend, period);
  const isRevenue = metric === "Revenue";
  const values = chartPoints.map((point) => isRevenue ? point.revenue : point.orders);
  const maximum = isRevenue
    ? niceMaximum(Math.max(...values, 0))
    : Math.max(4, niceMaximum(Math.max(...values, 0)));
  const coordinates = values.map((value, index) => ({
    x: chartPoints.length <= 1 ? chartWidth / 2 : (index / (chartPoints.length - 1)) * chartWidth,
    y: plotPadding + (1 - value / maximum) * (chartHeight - plotPadding * 2),
  }));
  const linePath = coordinates.map((point, index) =>
    `${index === 0 ? "M" : "L"}${point.x},${point.y}`,
  ).join(" ");
  const areaPath = coordinates.length > 0
    ? `${linePath} L${coordinates.at(-1)?.x ?? chartWidth},${chartHeight} L${coordinates[0].x},${chartHeight} Z`
    : "";
  const selectedIndex = activeChartIndex === null
    ? null
    : Math.min(activeChartIndex, Math.max(0, chartPoints.length - 1));
  const selected = selectedIndex === null ? null : chartPoints[selectedIndex];
  const selectedCoordinate = selectedIndex === null ? null : coordinates[selectedIndex];
  const selectedValue = selectedIndex === null ? 0 : values[selectedIndex];
  const previousValue = selectedIndex && selectedIndex > 0 ? values[selectedIndex - 1] : 0;
  const change = previousValue === 0
    ? selectedValue === 0 ? "0%" : "New"
    : `${((selectedValue - previousValue) / previousValue * 100).toFixed(1)}%`;
  const axisValues = [maximum, maximum * 0.75, maximum * 0.5, maximum * 0.25, 0];
  const periodDescription = period === "Daily"
    ? "last 7 days"
    : period === "Weekly" ? "last 8 weeks" : "last 12 months";
  const previousPeriod = period === "Daily" ? "day" : period === "Weekly" ? "week" : "month";
  const formatPointDate = (point: SalesTrendPoint) => period === "Monthly"
    ? monthAxisLabel.format(parseDate(point.date))
    : dateLabel.format(parseDate(point.date));

  return (
    <article className="sales-panel panel">
      <div className="panel-heading">
        <div>
          <h2>Sales overview</h2>
          <p>Completed marketplace sales for the {periodDescription}</p>
        </div>
        <div className="sales-panel-actions">
          <div className="sales-period-tabs" aria-label="Sales chart period">
            {(["Daily", "Weekly", "Monthly"] as const).map((option) => (
              <button
                className={period === option ? "active" : ""}
                key={option}
                onClick={() => {
                  setPeriod(option);
                  onChartLeave();
                }}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          <div className="panel-action">
            <button className="ghost-button" onClick={onToggleMetric}>
              {metric}
              <Icon name="chevron" size={15} />
            </button>
            {metricOpen && (
              <div className="dropdown-menu compact">
                <button onClick={() => onSelectMetric("Revenue")}>Revenue</button>
                <button onClick={() => onSelectMetric("Orders")}>Orders</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="sales-summary">
        <strong>
          {isRevenue ? currency.format(totalSales) : `${totalOrders.toLocaleString("en-US")} orders`}
        </strong>
        <span><b>Live database total</b></span>
      </div>
      <div className="chart-wrap">
        <div className="chart-y">
          {axisValues.map((value, index) => (
            <span key={index}>
              {isRevenue ? compactCurrency.format(value) : Math.round(value).toLocaleString("en-US")}
            </span>
          ))}
        </div>
        <div
          className="line-chart"
          aria-label={`${metric} from completed sales for the ${periodDescription}`}
          onPointerEnter={(event) => onChartPointer(event.clientX, event.currentTarget, chartPoints.length)}
          onPointerMove={(event) => onChartPointer(event.clientX, event.currentTarget, chartPoints.length)}
          onPointerLeave={onChartLeave}
        >
          <div className="grid-line line-1" />
          <div className="grid-line line-2" />
          <div className="grid-line line-3" />
          <div className="grid-line line-4" />
          <div className="grid-line line-5" />
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img">
            <defs>
              <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-forest-green)" stopOpacity=".24" />
                <stop offset="100%" stopColor="var(--brand-forest-green)" stopOpacity="0" />
              </linearGradient>
              <clipPath id="salesChartReveal" clipPathUnits="userSpaceOnUse">
                <rect className="sales-reveal-rect" x="0" y="0" width={chartWidth} height={chartHeight} />
              </clipPath>
            </defs>
            <g clipPath="url(#salesChartReveal)">
              <path className="sales-area-path" d={areaPath} fill="url(#salesFill)" />
              <path className="sales-line-path" d={linePath} fill="none" stroke="var(--brand-forest-green)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </g>
            {coordinates.length > 0 && (
              <circle className="sales-line-point" cx={coordinates.at(-1)?.x} cy={coordinates.at(-1)?.y} r="5" fill="#fff" stroke="var(--brand-forest-green)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {selected && selectedCoordinate && (
            <>
              <span className="chart-point-marker" style={{ left: `${selectedCoordinate.x / chartWidth * 100}%`, top: `${selectedCoordinate.y / chartHeight * 100}%` }} />
              <div className={`chart-tooltip dynamic-chart-tooltip${selectedIndex !== null && selectedIndex >= chartPoints.length / 2 ? " tooltip-below" : ""}`} style={{ left: `${selectedCoordinate.x / chartWidth * 100}%`, top: `${selectedCoordinate.y / chartHeight * 100}%` }}>
                <i className="tooltip-rail" />
                <div>
                  <strong>{isRevenue ? "Revenue collected" : "Sales completed"}</strong>
                  <span>{period === "Weekly" ? "Week ending " : ""}{period === "Monthly" ? monthLabel.format(parseDate(selected.date)) : fullDate.format(parseDate(selected.date))}</span>
                  <b>{isRevenue ? currency.format(selected.revenue) : `${selected.orders} ${selected.orders === 1 ? "order" : "orders"}`}</b>
                  <p><em>{change}</em> from prev. {previousPeriod}</p>
                </div>
              </div>
            </>
          )}
          <div className="chart-x">
            {chartPoints.map((point) => <span key={point.date}>{formatPointDate(point)}</span>)}
          </div>
        </div>
      </div>
    </article>
  );
}
