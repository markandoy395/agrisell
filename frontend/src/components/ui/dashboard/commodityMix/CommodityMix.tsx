import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { CommodityMixItem } from "../../../../types/adminData";
import { Icon } from "../../icon/Icon";
import { Tooltip } from "../../tooltip/Tooltip";
import "./CommodityMix.css";

type CommodityMixProps = {
  items: CommodityMixItem[];
  panelMenu: "commodity" | "delivery" | null;
  onNavigate: (section: string) => void;
  onToggleMenu: () => void;
  onExport: () => void;
};

type SliceStyle = CSSProperties & {
  "--slice-delay": string;
  "--slice-x": string;
  "--slice-y": string;
};

const PIE_CENTER = 80;
const PIE_OUTER_RADIUS = 64;
const PIE_INNER_RADIUS = 39;
const SLICE_HOVER_OFFSET = 8;

function getPointOnCircle(radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;

  return {
    x: PIE_CENTER + radius * Math.cos(radians),
    y: PIE_CENTER + radius * Math.sin(radians),
  };
}

function getSlicePath(startAngle: number, endAngle: number) {
  const outerStart = getPointOnCircle(PIE_OUTER_RADIUS, startAngle);
  const outerEnd = getPointOnCircle(PIE_OUTER_RADIUS, endAngle);
  const innerEnd = getPointOnCircle(PIE_INNER_RADIUS, endAngle);
  const innerStart = getPointOnCircle(PIE_INNER_RADIUS, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${PIE_OUTER_RADIUS} ${PIE_OUTER_RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${PIE_INNER_RADIUS} ${PIE_INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

type CommoditySlice = CommodityMixItem & {
  endAngle: number;
  path: string;
  startAngle: number;
  xOffset: number;
  yOffset: number;
};

const getSliceStyle = (
  slice: CommoditySlice,
  index: number,
): SliceStyle => ({
  "--slice-delay": `${560 + index * 80}ms`,
  "--slice-x": `${slice.xOffset.toFixed(2)}px`,
  "--slice-y": `${slice.yOffset.toFixed(2)}px`,
});

export function CommodityMix({
  items,
  panelMenu,
  onNavigate,
  onToggleMenu,
  onExport,
}: CommodityMixProps) {
  const totalCommodityOrders = items.reduce(
    (total, item) => total + item.orders,
    0,
  );
  const commoditySlices = useMemo(
    () =>
      items.reduce<CommoditySlice[]>((slices, item) => {
        const previousSlice = slices[slices.length - 1];
        const startAngle = previousSlice?.endAngle ?? 0;
        const sweep =
          totalCommodityOrders === 0
            ? 0
            : (item.orders / totalCommodityOrders) * 360;
        const endAngle = startAngle + sweep;
        const midAngle = startAngle + sweep / 2;
        const offsetPoint = getPointOnCircle(SLICE_HOVER_OFFSET, midAngle);

        return [
          ...slices,
          {
            ...item,
            endAngle,
            path: getSlicePath(startAngle, endAngle),
            startAngle,
            xOffset: offsetPoint.x - PIE_CENTER,
            yOffset: offsetPoint.y - PIE_CENTER,
          },
        ];
      }, []),
    [items, totalCommodityOrders],
  );
  const [activeSlice, setActiveSlice] = useState<CommoditySlice | null>(null);

  return (
    <article className="category-panel panel">
      <div className="panel-heading">
        <div>
          <h2>Commodity mix</h2>
          <p>Orders by product category</p>
        </div>
        <div className="panel-action">
          <Tooltip content="Commodity options">
            <button
              className="more-button"
              onClick={onToggleMenu}
              aria-label="Commodity options"
            >
              <Icon name="more" size={20} />
            </button>
          </Tooltip>
          {panelMenu === "commodity" && (
            <div className="dropdown-menu compact">
              <button onClick={() => onNavigate("Commodities")}>
                View categories
              </button>
              <button onClick={onExport}>Export report</button>
            </div>
          )}
        </div>
      </div>
      <div className="donut-area">
        <div className="donut">
          <svg
            className="donut-chart"
            viewBox="0 0 160 160"
            role="list"
            aria-label="Orders by product category"
          >
            {commoditySlices.map((slice, index) => (
              <g
                key={slice.name}
                className={`donut-slice${
                  activeSlice?.name === slice.name ? " is-active" : ""
                }`}
                role="listitem"
                tabIndex={0}
                aria-label={`${slice.name}: ${slice.orders} orders`}
                onBlur={() => setActiveSlice(null)}
                onFocus={() => setActiveSlice(slice)}
                onMouseEnter={() => setActiveSlice(slice)}
                onMouseLeave={() => setActiveSlice(null)}
                style={getSliceStyle(slice, index)}
              >
                <path d={slice.path} fill={slice.color} />
              </g>
            ))}
          </svg>
          <div className="donut-center">
            <strong>
              {(activeSlice?.orders ?? totalCommodityOrders).toLocaleString(
                "en-US",
              )}
            </strong>
            <span>{activeSlice?.name ?? "orders"}</span>
          </div>
        </div>
        <div className="donut-legend">
          {commoditySlices.map((slice) => (
            <button
              key={slice.name}
              className={activeSlice?.name === slice.name ? "is-active" : ""}
              type="button"
              onBlur={() => setActiveSlice(null)}
              onFocus={() => setActiveSlice(slice)}
              onMouseEnter={() => setActiveSlice(slice)}
              onMouseLeave={() => setActiveSlice(null)}
            >
              <i style={{ background: slice.color }} />
              <span>{slice.name}</span>
              <strong>{slice.orders}</strong>
            </button>
          ))}
        </div>
      </div>
      <button className="text-link" onClick={() => onNavigate("Commodities")}>
        View commodity report <Icon name="arrow" size={16} />
      </button>
    </article>
  );
}
