export type LocationPinKind = 'user' | 'farmer' | 'farm'

export type LocationPin = {
  id: string
  label: string
  owner: string
  detail: string
  kind: LocationPinKind
  status: string
  tone: string
  gpsLat: number
  gpsLong: number
}
