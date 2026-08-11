import type { ReactNode } from "react";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Tooltip.css";

type TooltipSide = "top" | "bottom" | "left" | "right";

type TooltipProps = {
  content: string;
  children: ReactNode;
  side?: TooltipSide;
  size?: "default" | "compact";
};

type TooltipPosition = {
  top: number;
  left: number;
  side: TooltipSide;
};

const TOOLTIP_GAP = 10;
const VIEWPORT_PADDING = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getPlacementOrder(preferredSide: TooltipSide) {
  return [
    preferredSide,
    ...(["top", "bottom", "left", "right"] as TooltipSide[]).filter(
      (side) => side !== preferredSide,
    ),
  ];
}

export function Tooltip({
  content,
  children,
  side = "top",
  size = "default",
}: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;

    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const availableSpace: Record<TooltipSide, number> = {
      top: triggerRect.top - TOOLTIP_GAP - VIEWPORT_PADDING,
      bottom:
        window.innerHeight -
        triggerRect.bottom -
        TOOLTIP_GAP -
        VIEWPORT_PADDING,
      left: triggerRect.left - TOOLTIP_GAP - VIEWPORT_PADDING,
      right:
        window.innerWidth - triggerRect.right - TOOLTIP_GAP - VIEWPORT_PADDING,
    };
    const placementOrder = getPlacementOrder(side);
    const resolvedSide =
      placementOrder.find(
        (candidate) =>
          availableSpace[candidate] >=
          (candidate === "top" || candidate === "bottom"
            ? tooltipRect.height
            : tooltipRect.width),
      ) ??
      placementOrder.reduce((best, candidate) =>
        availableSpace[candidate] > availableSpace[best] ? candidate : best,
      );

    let top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

    if (resolvedSide === "top")
      top = triggerRect.top - tooltipRect.height - TOOLTIP_GAP;
    if (resolvedSide === "bottom") top = triggerRect.bottom + TOOLTIP_GAP;
    if (resolvedSide === "left")
      left = triggerRect.left - tooltipRect.width - TOOLTIP_GAP;
    if (resolvedSide === "right") left = triggerRect.right + TOOLTIP_GAP;

    setPosition({
      top: clamp(
        top,
        VIEWPORT_PADDING,
        Math.max(
          VIEWPORT_PADDING,
          window.innerHeight - tooltipRect.height - VIEWPORT_PADDING,
        ),
      ),
      left: clamp(
        left,
        VIEWPORT_PADDING,
        Math.max(
          VIEWPORT_PADDING,
          window.innerWidth - tooltipRect.width - VIEWPORT_PADDING,
        ),
      ),
      side: resolvedSide,
    });
  }, [side]);

  useLayoutEffect(() => {
    if (!isVisible) return;

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const resizeObserver = new ResizeObserver(updatePosition);
    if (triggerRef.current) resizeObserver.observe(triggerRef.current);
    if (tooltipRef.current) resizeObserver.observe(tooltipRef.current);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver.disconnect();
    };
  }, [content, isVisible, updatePosition]);

  const showTooltip = () => setIsVisible(true);
  const hideTooltip = () => {
    setIsVisible(false);
    setPosition(null);
  };

  return (
    <>
      <span className={`tooltip tooltip--${size}`}>
        <span
          ref={triggerRef}
          className="tooltip-trigger"
          aria-describedby={isVisible ? tooltipId : undefined}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
        >
          {children}
        </span>
      </span>
      {isVisible &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            className={`tooltip-content tooltip-content--${size}`}
            data-side={position?.side ?? side}
            role="tooltip"
            style={
              position
                ? { top: position.top, left: position.left }
                : { top: 0, left: 0, visibility: "hidden" }
            }
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}
