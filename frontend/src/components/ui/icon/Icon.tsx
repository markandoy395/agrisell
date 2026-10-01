import type { IconName } from '../../../types/dashboard'
import { iconGlyphs } from './iconGlyphs'
import './Icon.css'

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
      {iconGlyphs[name]}
    </svg>
  )
}
