import { useMemo, useState } from 'react'
import type { EntityRecord, FarmerFarm } from '../types/dashboard'
import {
  allFarmerLocationsFilter,
  allFarmerSpecialtiesFilter,
  allFarmerStatusFilter,
  createFarmerFarmLookup,
  farmerPageSize,
  getFarmerLocationOptions,
  getFarmerRecordKey,
  getFarmerRecordsMatchingSearch,
  getFarmerSpecialtyOptions,
  getFarmerStatusOptions,
  getFilteredFarmerRecords,
} from '../utils/farmerWorkspace'

type UseFarmerFiltersParams = {
  allFarmers: EntityRecord[]
  farms: FarmerFarm[]
  search: string
}

export function useFarmerFilters({ allFarmers, farms, search }: UseFarmerFiltersParams) {
  const [query, setQuery] = useState('')
  const [specialtyFilter, setSpecialtyFilter] = useState(allFarmerSpecialtiesFilter)
  const [locationFilter, setLocationFilter] = useState(allFarmerLocationsFilter)
  const [statusFilter, setStatusFilter] = useState(allFarmerStatusFilter)
  const [selectedFarmerRecordKeys, setSelectedFarmerRecordKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [farmerCurrentPage, setFarmerCurrentPage] = useState(1)
  const farmerFarmLookup = useMemo(() => createFarmerFarmLookup(farms), [farms])
  const topbarMatches = useMemo(
    () => getFarmerRecordsMatchingSearch(allFarmers, farmerFarmLookup, search),
    [allFarmers, farmerFarmLookup, search],
  )
  const filteredFarmers = useMemo(
    () =>
      getFilteredFarmerRecords(topbarMatches, farmerFarmLookup, {
        query,
        specialty: specialtyFilter,
        location: locationFilter,
        status: statusFilter,
      }),
    [farmerFarmLookup, locationFilter, query, specialtyFilter, statusFilter, topbarMatches],
  )
  const totalFarmerPages = Math.max(1, Math.ceil(filteredFarmers.length / farmerPageSize))
  const activeFarmerPage = Math.min(farmerCurrentPage, totalFarmerPages)
  const pageFarmers = filteredFarmers.slice(
    (activeFarmerPage - 1) * farmerPageSize,
    activeFarmerPage * farmerPageSize,
  )
  const visibleKeys = pageFarmers.map(getFarmerRecordKey)
  const allVisibleFarmersSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selectedFarmerRecordKeys.has(key))

  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setFarmerCurrentPage(1)
  }
  const toggleAllVisibleFarmers = () => {
    setSelectedFarmerRecordKeys((current) => {
      const next = new Set(current)
      visibleKeys.forEach((key) => {
        if (allVisibleFarmersSelected) next.delete(key)
        else next.add(key)
      })
      return next
    })
  }
  const toggleFarmerSelection = (recordKey: string) => {
    setSelectedFarmerRecordKeys((current) => {
      const next = new Set(current)
      if (next.has(recordKey)) next.delete(recordKey)
      else next.add(recordKey)
      return next
    })
  }

  return {
    activeFarmerPage,
    allVisibleFarmersSelected,
    farmerControls: {
      locationFilter,
      locationOptions: getFarmerLocationOptions(allFarmers, farmerFarmLookup),
      query,
      specialtyFilter,
      specialtyOptions: getFarmerSpecialtyOptions(allFarmers),
      statusFilter,
      statusOptions: getFarmerStatusOptions(allFarmers),
    },
    farmerFarmLookup,
    farmerPageNumbers: Array.from({ length: totalFarmerPages }, (_, index) => index + 1),
    filteredFarmers,
    pageFarmers,
    selectedFarmerRecordKeys,
    totalFarmerPages,
    setFarmerCurrentPage,
    toggleAllVisibleFarmers,
    toggleFarmerSelection,
    updateFarmerLocationFilter: updateFilter(setLocationFilter),
    updateFarmerQuery: updateFilter(setQuery),
    updateFarmerSpecialtyFilter: updateFilter(setSpecialtyFilter),
    updateFarmerStatusFilter: updateFilter(setStatusFilter),
  }
}
