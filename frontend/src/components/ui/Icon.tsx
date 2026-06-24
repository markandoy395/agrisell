import type { CSSProperties, ReactNode } from "react";
import type { IconName } from "../../types/dashboard";
import bellOutlineClassic from "../../assets/icons/bellOutlineClassic.png";
import basketOutlineBars from "../../assets/icons/basketOutlineBars.png";
import shoppingBasketOutline from "../../assets/icons/shoppingBasketOutline.png";
import userCircleOutline from "../../assets/icons/userCircleOutline.png";

const assetIcons: Partial<Record<IconName, string>> = {
  bell: bellOutlineClassic,
  basket: basketOutlineBars,
  cart: shoppingBasketOutline,
  users: userCircleOutline,
};

const icons: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 22V12" />
      <path d="M12 12C8 12 5 9.5 5 5c4 0 7 2.5 7 7Z" />
      <path d="M12 16c0-4 2.8-7 7-7 0 4-2.8 7-7 7Z" />
    </>
  ),
  basket: (
    <>
      <path d="M3 10h18l-1.4 10H4.4L3 10Z" />
      <path d="m8 10 4-6 4 6M7 14h10" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.3 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h3" />
    </>
  ),
  star: (
    <path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20.3h-3v-.1a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.12 15a1.7 1.7 0 0 0-1.55-1H5.5v-3h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V4.7h3v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.55 1h.08v3h-.08a1.7 1.7 0 0 0-1.55 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  trend: (
    <>
      <path d="m3 17 6-6 4 4 7-8" />
      <path d="M15 7h5v5" />
    </>
  ),
  leaf: (
    <path d="M20.2 3.8C13.5 3.6 7.1 5.6 5.2 11.2 3.7 15.7 6.4 19.4 10 20c2.7.5 5.5-1 6.5-3.5-2.8 1-5 .1-6.2-1.5-1.6-2.2.2-5.7 9.9-11.2Z" />
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const assetIcon = assetIcons[name];

  if (assetIcon) {
    const style: CSSProperties = {
      width: size,
      height: size,
      WebkitMask: `url(${assetIcon}) center / contain no-repeat`,
      mask: `url(${assetIcon}) center / contain no-repeat`,
    };

    return <span className="icon asset-icon" style={style} aria-hidden="true" />;
  }

  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}
