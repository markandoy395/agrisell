import { useMemo, useState } from 'react'
import type { EntityRecord } from '../../types/dashboard'
import {
  allAvailability,
  allCompanies,
  getRiderRecordKey,
  ridersPerPage,
} from './logisticsWorkspace.utils'

export type MenuPosition = {
  top?: number
  bottom?: number
  right: number
  placement: 'top' | 'bottom'
}

type UseLogisticsWorkspaceParams = {
  created: EntityRecord[]
  records: EntityRecord[]
  search: string
}

export function useLogisticsWorkspace({ created, records, search }: UseLogisticsWorkspaceParams) {
  const [query, setQuery] = useState('')
  const [companyFilter, setCompanyFilter] = useState(allCompanies)
  const [availabilityFilter, setAvailabilityFilter] = useState(allAvailability)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const [statusOverrides, setStatusOverrides] = useState<Map<string, string>>(() => new Map())
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(() => new Set())

  const rawRiders = useMemo(() => [...created, ...records], [created, records])
  const allRiders = useMemo(
    () =>
      rawRiders
        .filter((rider) => !deletedKeys.has(getRiderRecordKey(rider)))
        .map((rider) => ({
          ...rider,
          status: statusOverrides.get(getRiderRecordKey(rider)) ?? rider.status,
        })),
    [rawRiders, deletedKeys, statusOverrides],
  )

  const companies = useMemo(
    () => [allCompanies, ...Array.from(new Set(allRiders.map((rider) => rider.category))).sort()],
    [allRiders],
  )
  const availabilityOptions = useMemo(
    () => [allAvailability, ...Array.from(new Set(allRiders.map((rider) => rider.status))).sort()],
    [allRiders],
  )
  const filteredRiders = useMemo(() => {
    const terms = `${search} ${query}`.trim().toLowerCase()
    return allRiders.filter((rider) => {
      const text = `${rider.primary} ${rider.secondary} ${rider.category} ${rider.value} ${rider.status} ${rider.approvalStatus ?? ''}`
      return (
        (!terms || text.toLowerCase().includes(terms)) &&
        (companyFilter === allCompanies || rider.category === companyFilter) &&
        (availabilityFilter === allAvailability || rider.status === availabilityFilter)
      )
    })
  }, [allRiders, availabilityFilter, companyFilter, query, search])
  const totalPages = Math.max(1, Math.ceil(filteredRiders.length / ridersPerPage))
  const activePage = Math.min(currentPage, totalPages)
  const pageRiders = filteredRiders.slice(
    (activePage - 1) * ridersPerPage,
    activePage * ridersPerPage,
  )
  const visibleKeys = pageRiders.map(getRiderRecordKey)
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key))
  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setCurrentPage(1)
  }
  const toggleRiderSelection = (recordKey: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(recordKey)) next.delete(recordKey)
      else next.add(recordKey)
      return next
    })
  }
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current)
      visibleKeys.forEach((key) => {
        if (allVisibleSelected) next.delete(key)
        else next.add(key)
      })
      return next
    })
  }
  const toggleMenu = (recordKey: string, triggerElement?: HTMLElement | null) => {
    if (openMenuKey === recordKey) {
      closeMenu()
      return
    }

    if (triggerElement) {
      const rect = triggerElement.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const menuHeight = 220
      const openUpwards = spaceBelow < menuHeight && spaceAbove > spaceBelow

      setMenuPosition({
        placement: openUpwards ? 'top' : 'bottom',
        top: openUpwards ? undefined : Math.round(rect.bottom + 6),
        bottom: openUpwards ? Math.round(window.innerHeight - rect.top + 6) : undefined,
        right: Math.round(Math.max(16, window.innerWidth - rect.right)),
      })
    }

    setOpenMenuKey(recordKey)
    setSubmenuOpen(false)
  }

  const closeMenu = () => {
    setOpenMenuKey(null)
    setMenuPosition(null)
    setSubmenuOpen(false)
  }

  const updateRiderStatus = (recordKey: string, status: string) => {
    setStatusOverrides((current) => new Map(current).set(recordKey, status))
    closeMenu()
  }

  const deleteRiderRecord = (recordKey: string) => {
    setDeletedKeys((prev) => new Set(prev).add(recordKey))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(recordKey)
      return next
    })
    closeMenu()
  }

  return {
    activePage,
    allRiders,
    allVisibleSelected,
    availabilityFilter,
    availabilityOptions,
    closeMenu,
    companies,
    companyFilter,
    deleteRiderRecord,
    filteredRiders,
    menuPosition,
    openMenuKey,
    pageNumbers: Array.from({ length: totalPages }, (_, index) => index + 1),
    pageRiders,
    query,
    selected,
    setSubmenuOpen,
    submenuOpen,
    toggleMenu,
    totalPages,
    setCurrentPage,
    toggleAllVisible,
    toggleRiderSelection,
    updateAvailabilityFilter: updateFilter(setAvailabilityFilter),
    updateCompanyFilter: updateFilter(setCompanyFilter),
    updateQuery: updateFilter(setQuery),
    updateRiderStatus,
  }
}
