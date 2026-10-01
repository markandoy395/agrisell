import type { CSSProperties } from 'react'
import type { LocationPin } from '../../../types/dashboard'

export type LocationPinsMapProps = {
  title: string
  description: string
  pins: LocationPin[]
}

export type MapSize = { width: number; height: number }
export type ProjectedPoint = { x: number; y: number }
export type MapTile = { key: string; src: string; style: CSSProperties }
export type PlottedPin = { pin: LocationPin; style: CSSProperties }
