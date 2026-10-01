import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchDeliveries, fetchDeliveryOptions } from '../../api/deliveries'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { Delivery, DeliveryOptions } from '../../types/delivery'
import type { EntityRecord } from '../../types/entityWorkspace'
import { isOverdue } from '../../utils/delivery'
import {
  fetchDeliveriesCached, getDeliveryCache,
  setDefaultDeliveryFetcher,
} from './deliveryCache'
import { DELIVERY_PAGE_SIZE, createFallbackDeliveries } from './deliveryWorkspace.utils'

setDefaultDeliveryFetcher((sig) =>
  Promise.all([fetchDeliveries(false, sig), fetchDeliveryOptions(sig)]),
)

export function useDeliveryData(search: string, fallbackRecords?: EntityRecord[]) {
  const initialCache = getDeliveryCache()
  const fallbackRecordsRef = useRef(fallbackRecords)
  useEffect(() => {
    fallbackRecordsRef.current = fallbackRecords
  }, [fallbackRecords])

  const hasFallback = Boolean(fallbackRecords?.length)
  const [deliveries, setDeliveries] = useState<Delivery[]>(() =>
    initialCache.deliveries?.length
      ? initialCache.deliveries
      : fallbackRecords?.length
        ? createFallbackDeliveries(fallbackRecords)
        : [],
  )
  const [options, setOptions] = useState<DeliveryOptions>(
    () => initialCache.options ?? { orders: [], riders: [] },
  )
  const [loading, setLoading] = useState(
    () => initialCache.deliveries === null && !hasFallback,
  )
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [rider, setRider] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [overdue, setOverdue] = useState(false)
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState(1)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const refresh = useCallback(async (options?: { forceLoading?: boolean }) => {
    const hasCache = getDeliveryCache().deliveries !== null
    if (!hasCache || options?.forceLoading) {
      setLoading(true)
    }
    setError('')
    try {
      const [rows, choices] = await fetchDeliveriesCached(undefined, (sig) =>
        Promise.all([fetchDeliveries(false, sig), fetchDeliveryOptions(sig)]),
      )
      setDeliveries(rows)
      setOptions(choices)
      setError('')
      setReload((v) => v + 1)
      return rows
    } catch (cause: unknown) {
      const isAbort =
        cause instanceof Error &&
        (cause.name === 'AbortError' || cause.message.toLowerCase().includes('abort'))
      if (isAbort) return
      const currentFallbacks = fallbackRecordsRef.current
      if (currentFallbacks?.length) {
        const fallback = createFallbackDeliveries(currentFallbacks)
        setDeliveries(fallback)
        return
      }
      setError(getApiErrorMessage(cause, 'Could not load deliveries.'))
      throw cause
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  const filtered = useMemo(
    () =>
      deliveries.filter((delivery) => {
        const terms = `${search} ${query}`.trim().toLowerCase()
        const schedule = delivery.estimated_delivery_time
          ? new Date(delivery.estimated_delivery_time)
          : null
        const day = schedule
          ? `${schedule.getFullYear()}-${String(schedule.getMonth() + 1).padStart(2, '0')}-${String(schedule.getDate()).padStart(2, '0')}`
          : ''
        return (
          (!terms ||
            `${delivery.delivery_id} ${delivery.order_id} ${delivery.customer_name ?? ''} ${delivery.rider_name ?? ''} ${delivery.pickup_location ?? ''} ${delivery.dropoff_location ?? ''}`
              .toLowerCase()
              .includes(terms)) &&
          (!status || delivery.delivery_status === status) &&
          (!rider || (rider === 'unassigned' ? !delivery.rider_id : delivery.rider_id === rider)) &&
          (!from || day >= from) &&
          (!to || Boolean(day && day <= to)) &&
          (!overdue || isOverdue(delivery, now))
        )
      }),
    [deliveries, from, now, overdue, query, rider, search, status, to],
  )

  const sorted = useMemo(
    () =>
      [...filtered].sort((left, right) => {
        const leftTime = Date.parse(left.estimated_delivery_time || '') || 0
        const rightTime = Date.parse(right.estimated_delivery_time || '') || 0
        return sortDirection === 'desc' ? rightTime - leftTime : leftTime - rightTime
      }),
    [filtered, sortDirection],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / DELIVERY_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  return {
    currentPage,
    deliveries,
    error,
    filtered,
    from,
    loading,
    now,
    options,
    overdue,
    page,
    query,
    refresh,
    reload,
    rider,
    setFrom,
    setOverdue,
    setPage,
    setQuery,
    setRider,
    setSortDirection,
    setStatus,
    setTo,
    sortDirection,
    sorted,
    status,
    to,
    totalPages,
  }
}

export type DeliveryDataState = ReturnType<typeof useDeliveryData>
