import type { ReactNode } from "react";
import type { IconName } from "../../../types/dashboard";
import './Icon.css';

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
  rider: (
    <>
      <circle cx="13" cy="5.5" r="2.5" />
      <path d="M9.5 11.2 12 8h3.4l2.1 3.8" />
      <path d="m11.2 12.4 2.8 2.2 2.5-2.4" />
      <path d="M5.2 17.5h3.1l2.8-4.9" />
      <circle cx="6.5" cy="17.5" r="3.2" />
      <circle cx="18" cy="17.5" r="3.2" />
      <path d="M9.2 17.5H15l-3.3-4.1" />
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
  close: <path d="m6 6 12 12M18 6 6 18" />,
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
  filter: (
    <>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  sort: (
    <>
      <path d="M8 5v14" />
      <path d="m5 8 3-3 3 3" />
      <path d="M16 19V5" />
      <path d="m13 16 3 3 3-3" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 20h14" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  leaf: (
    <path d="M20.2 3.8C13.5 3.6 7.1 5.6 5.2 11.2 3.7 15.7 6.4 19.4 10 20c2.7.5 5.5-1 6.5-3.5-2.8 1-5 .1-6.2-1.5-1.6-2.2.2-5.7 9.9-11.2Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  message: (
    <>
      <path d="M4 5h16v11H8l-4 4V5Z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  heart: (
    <path d="M20.8 8.5c0 5.4-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.5A4.5 4.5 0 0 1 11 5.4l1 1 1-1a4.5 4.5 0 0 1 7.8 3.1Z" />
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" />
      <path d="M7.2 7.7C4.2 9.5 2.5 12 2.5 12s3.5 6 9.5 6c1.6 0 3-.4 4.2-1" />
      <path d="M12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.4 3" />
    </>
  ),
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  edit: (
    <>
      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M7.1 5.8a8 8 0 1 0 9.8 0" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 7.5v4.2M6 15.5v-2h12v2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 17h.01" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4.5 21v-2.2A5.8 5.8 0 0 1 10.3 13h3.4a5.8 5.8 0 0 1 5.8 5.8V21" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.4 1-1.4 2.3M12 17h.01" />
    </>
  ),
  headset: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2v-3ZM20 14a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2v-3ZM17 19c-.7 1.3-2 2-4 2" />
    </>
  ),
  bulb: (
    <>
      <path d="M8.7 16.5A7 7 0 1 1 15.3 16.5c-.8.6-1.3 1.4-1.3 2.5h-4c0-1.1-.5-1.9-1.3-2.5Z" />
      <path d="M10 22h4M9 19h6" />
    </>
  ),
  logout: (
    <>
      <path d="M14 5V3H4v18h10v-2" />
      <path d="M10 12h11M17 8l4 4-4 4" />
    </>
  ),
  home: <path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z" />,
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6l8-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  crown: <path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7ZM5 21h14" />,
  save: (
    <>
      <path d="M4 3h14l2 2v16H4V3Z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v5h4M9 12h7M9 16h7" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M18.2 16a7 7 0 1 1 .3-7.6L20 12" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
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
