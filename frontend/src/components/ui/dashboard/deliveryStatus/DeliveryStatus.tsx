import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { DeliveryStatusItem } from "../../../../types/adminData";
import { Icon } from "../../icon/Icon";
import { Tooltip } from "../../tooltip/Tooltip";
import "./DeliveryStatus.css";

type DeliveryStatusProps = {
  items: DeliveryStatusItem[];
  panelMenu: "commodity" | "delivery" | null;
  onNavigate: (section: string) => void;
  onToggleMenu: () => void;
  onExport: () => void;
};

type DeliverySegmentStyle = CSSProperties & {
  "--segment-delay": string;
  "--segment-x": string;
  "--segment-y": string;
};

const DELIVERY_CENTER = 80;
const DELIVERY_OUTER_RADIUS = 64;
const DELIVERY_INNER_RADIUS = 39;
const DELIVERY_HOVER_OFFSET = 8;

type DeliverySegment = DeliveryStatusItem & {
  endAngle: number;
  path: string;
  xOffset: number;
  yOffset: number;
};

function getDeliveryPoint(radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;

  return {
    x: DELIVERY_CENTER + radius * Math.cos(radians),
    y: DELIVERY_CENTER + radius * Math.sin(radians),
  };
}

function getDeliverySegmentPath(startAngle: number, endAngle: number) {
  const outerStart = getDeliveryPoint(DELIVERY_OUTER_RADIUS, startAngle);
  const outerEnd = getDeliveryPoint(DELIVERY_OUTER_RADIUS, endAngle);
  const innerEnd = getDeliveryPoint(DELIVERY_INNER_RADIUS, endAngle);
  const innerStart = getDeliveryPoint(DELIVERY_INNER_RADIUS, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${DELIVERY_OUTER_RADIUS} ${DELIVERY_OUTER_RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${DELIVERY_INNER_RADIUS} ${DELIVERY_INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

const getDeliverySegmentStyle = (
  segment: DeliverySegment,
  index: number,
): DeliverySegmentStyle => ({
  "--segment-delay": `${560 + index * 80}ms`,
  "--segment-x": `${segment.xOffset.toFixed(2)}px`,
  "--segment-y": `${segment.yOffset.toFixed(2)}px`,
});

export function DeliveryStatus({
  items,
  panelMenu,
  onNavigate,
  onToggleMenu,
  onExport,
}: DeliveryStatusProps) {
  const totalDeliveries = items.reduce((total, item) => total + item.value, 0);
  const deliverySegments = useMemo(
    () =>
      items.reduce<DeliverySegment[]>((segments, item) => {
        const previousSegment = segments[segments.length - 1];
        const startAngle = previousSegment?.endAngle ?? 0;
        const sweep =
          totalDeliveries === 0 ? 0 : (item.value / totalDeliveries) * 360;
        const endAngle = startAngle + sweep;
        const midAngle = startAngle + sweep / 2;
        const offsetPoint = getDeliveryPoint(DELIVERY_HOVER_OFFSET, midAngle);

        return [
          ...segments,
          {
            ...item,
            endAngle,
            path: getDeliverySegmentPath(startAngle, endAngle),
            xOffset: offsetPoint.x - DELIVERY_CENTER,
            yOffset: offsetPoint.y - DELIVERY_CENTER,
          },
        ];
      }, []),
    [items, totalDeliveries],
  );
  const [activeSegment, setActiveSegment] =
    useState<DeliverySegment | null>(null);

  return (
    <article className="delivery-panel panel">
      <div className="panel-heading">
        <div>
          <h2>Delivery status</h2>
          <p>Today's fulfilment pulse</p>
        </div>
        <div className="panel-action">
          <Tooltip content="Delivery options">
            <button
              className="more-button"
              onClick={onToggleMenu}
              aria-label="Delivery options"
            >
              <Icon name="more" size={20} />
            </button>
          </Tooltip>
          {panelMenu === "delivery" && (
            <div className="dropdown-menu compact">
              <button onClick={() => onNavigate("Deliveries")}>
                Open deliveries
              </button>
              <button onClick={onExport}>Export summary</button>
            </div>
          )}
        </div>
      </div>
      <div className="delivery-chart-area">
        <div className="delivery-ring">
          <svg
            className="delivery-ring-chart"
            viewBox="0 0 160 160"
            role="list"
            aria-label="Delivery status counts"
          >
            {deliverySegments.map((segment, index) => (
              <g
                key={segment.label}
                className={`delivery-ring-slice${
                  activeSegment?.label === segment.label ? " is-active" : ""
                }`}
                role="listitem"
                tabIndex={0}
                aria-label={`${segment.label}: ${segment.value}`}
                onBlur={() => setActiveSegment(null)}
                onFocus={() => setActiveSegment(segment)}
                onMouseEnter={() => setActiveSegment(segment)}
                onMouseLeave={() => setActiveSegment(null)}
                style={getDeliverySegmentStyle(segment, index)}
              >
                <path d={segment.path} fill={segment.color} />
              </g>
            ))}
          </svg>
          <div className="delivery-ring-center">
            <strong>
              {(activeSegment?.value ?? totalDeliveries).toLocaleString(
                "en-US",
              )}
            </strong>
            <small>{activeSegment?.label ?? "deliveries"}</small>
          </div>
        </div>
        <div className="delivery-stats">
          {deliverySegments.map((segment) => (
            <button
              key={segment.label}
              className={
                activeSegment?.label === segment.label ? "is-active" : ""
              }
              type="button"
              onBlur={() => setActiveSegment(null)}
              onFocus={() => setActiveSegment(segment)}
              onMouseEnter={() => setActiveSegment(segment)}
              onMouseLeave={() => setActiveSegment(null)}
            >
              <i className={segment.dotClass} />
              <span>{segment.label}</span>
              <strong>{segment.value}</strong>
            </button>
          ))}
        </div>
      </div>
      <button className="text-link" onClick={() => onNavigate("Deliveries")}>
        Manage deliveries <Icon name="arrow" size={16} />
      </button>
    </article>
  );
}
