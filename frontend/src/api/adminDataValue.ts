export type UnknownRecord = Record<string, unknown>

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const getArray = (value: unknown) => (Array.isArray(value) ? value : [])

export const getNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export const getString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback

export const getStringArray = (value: unknown) =>
  getArray(value).filter((item): item is string => typeof item === 'string')
