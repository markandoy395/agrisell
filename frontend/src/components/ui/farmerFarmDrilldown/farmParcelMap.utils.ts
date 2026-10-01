import type { FarmerFarm } from '../../../types/dashboard'

export const isValidCoordinate = (lat: number, long: number): boolean => {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(long) &&
    lat >= -90 &&
    lat <= 90 &&
    long >= -180 &&
    long <= 180 &&
    !(lat === 0 && long === 0)
  )
}

export const computeParcelGeofence = (
  lat: number,
  long: number,
  hectares: number,
  points = 32,
): [number, number][] => {
  if (!isValidCoordinate(lat, long)) return []

  const validHectares = Math.max(Number(hectares) || 1, 0.25)
  // 1 hectare = 10,000 square meters. Area = pi * r^2  =>  r = sqrt(area / pi)
  const radiusMeters = Math.max(Math.sqrt((validHectares * 10000) / Math.PI), 40)

  const earthRadiusMeters = 6378137
  const angularDistance = radiusMeters / earthRadiusMeters
  const latRad = (lat * Math.PI) / 180
  const longRad = (long * Math.PI) / 180

  const coordinates: [number, number][] = []

  for (let i = 0; i <= points; i++) {
    const bearing = (i * 2 * Math.PI) / points
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    )
    const pointLong =
      longRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat),
      )

    coordinates.push([(pointLong * 180) / Math.PI, (pointLat * 180) / Math.PI])
  }

  return coordinates
}

export const computeFarmsBoundingBox = (
  farms: FarmerFarm[],
): [number, number, number, number] | null => {
  const validFarms = farms.filter((f) => isValidCoordinate(f.gpsLat, f.gpsLong))
  if (validFarms.length === 0) return null

  let minLong = Infinity
  let minLat = Infinity
  let maxLong = -Infinity
  let maxLat = -Infinity

  for (const farm of validFarms) {
    if (farm.gpsLong < minLong) minLong = farm.gpsLong
    if (farm.gpsLong > maxLong) maxLong = farm.gpsLong
    if (farm.gpsLat < minLat) minLat = farm.gpsLat
    if (farm.gpsLat > maxLat) maxLat = farm.gpsLat
  }

  return [minLong, minLat, maxLong, maxLat]
}

export const formatCoordinates = (lat: number, long: number): string => {
  if (!isValidCoordinate(lat, long)) return 'Coordinates not set'
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`
  const longStr = `${Math.abs(long).toFixed(4)}° ${long >= 0 ? 'E' : 'W'}`
  return `${latStr}, ${longStr}`
}

export const computeFarmStats = (farms: FarmerFarm[]) => {
  const totalHectares = farms.reduce((sum, f) => sum + (Number(f.farmSizeHectares) || 0), 0)
  const cropsSet = new Set<string>()
  let validGpsCount = 0

  farms.forEach((f) => {
    if (isValidCoordinate(f.gpsLat, f.gpsLong)) validGpsCount++
    if (Array.isArray(f.mainCrops)) {
      f.mainCrops.forEach((crop) => {
        if (crop && typeof crop === 'string') cropsSet.add(crop.trim().toLowerCase())
      })
    }
  })

  return {
    totalHectares: Number(totalHectares.toFixed(2)),
    uniqueCropsCount: cropsSet.size,
    validGpsCount,
    totalFarms: farms.length,
  }
}
