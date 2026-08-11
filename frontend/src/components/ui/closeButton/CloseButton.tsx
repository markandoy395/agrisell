import type { ButtonHTMLAttributes } from 'react'
import { Icon } from '../icon/Icon'
import { Tooltip } from '../tooltip/Tooltip'
import './CloseButton.css'

type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

type CloseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type' | 'aria-label'> & {
  label: string
  tooltip?: string
  tooltipSide?: TooltipSide
}

export function CloseButton({ className, label, tooltip = 'Close', tooltipSide = 'top', ...buttonProps }: CloseButtonProps) {
  const button = (
    <button
      {...buttonProps}
      className={['close-button', className].filter(Boolean).join(' ')}
      type="button"
      aria-label={label}
    >
      <Icon name="close" size={16} />
    </button>
  )

  if (!tooltip) return button

  return (
    <Tooltip content={tooltip} side={tooltipSide} size="compact">
      {button}
    </Tooltip>
  )
}
