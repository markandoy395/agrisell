import type { ReactNode } from 'react'
import type { IconName } from '../../../types/dashboard'
import { actionIconGlyphs } from './iconGlyphsActions'
import { navigationIconGlyphs } from './iconGlyphsNavigation'

export const iconGlyphs: Record<IconName, ReactNode> = {
  ...navigationIconGlyphs,
  ...actionIconGlyphs,
}
