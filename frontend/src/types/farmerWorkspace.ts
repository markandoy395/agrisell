import type { IconName } from './icon'

export type FarmImage = {
  title: string
  alt: string
  imageUrl: string
}

export type FarmerFarm = {
  id: string
  farmerId: string
  farmName: string
  farmLocation: string
  gpsLat: number
  gpsLong: number
  totalCrops: number
  farmSizeHectares: number
  farmingType: string
  soilType: string
  irrigationType: string
  mainCrops: string[]
  certifications: string[]
  commodities: string[]
  farmImages: FarmImage[]
  status: string
  tone: string
}

export type FarmerFarmLookup = Record<string, FarmerFarm[]>

export type FarmerWorkspaceFilters = {
  query: string
  specialty: string
  location: string
  status: string
}

export type FarmerSummaryCard = {
  label: string
  value: string
  detail: string
  trend: string
  icon: IconName
}
