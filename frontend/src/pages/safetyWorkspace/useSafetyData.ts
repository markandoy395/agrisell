import { useCallback, useEffect, useRef, useState } from 'react'
import { getSafetyIncidents, resolveSafetyIncident } from '../../api/adminSafetyApi'
import type {
  SafetyFilterTab,
  SafetyIncident,
  SafetyIncidentSummary,
  SafetyIncidentsResponse,
} from './safetyWorkspace.types'
import {
  fetchSafetyCached,
  getSafetyCache,
  setSafetyCache,
} from './safetyCache'

export function useSafetyData(onNotice: (message: string) => void) {
  const noticeRef = useRef(onNotice)
  const initialCache = getSafetyCache()
  const [incidents, setIncidents] = useState<SafetyIncident[]>(
    () => initialCache?.incidents ?? [],
  )
  const [summary, setSummary] = useState<SafetyIncidentSummary>(
    () =>
      initialCache?.summary ?? {
        total_incidents: 0,
        open_emergencies: 0,
        active_accidents: 0,
        under_review: 0,
        resolved: 0,
      },
  )
  const [isLoading, setIsLoading] = useState(() => initialCache === null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SafetyFilterTab>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedIncident, setSelectedIncident] = useState<SafetyIncident | null>(null)
  const [busyIncidentId, setBusyIncidentId] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  useEffect(() => {
    noticeRef.current = onNotice
  }, [onNotice])

  const load = useCallback(
    async (isBackground = false) => {
      const hasCache = getSafetyCache() !== null
      if (!isBackground && !hasCache) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      try {
        const isDefault = filter === 'all' && !search.trim()
        let data: SafetyIncidentsResponse
        if (isDefault && !isBackground) {
          data = await fetchSafetyCached(undefined, undefined, true)
        } else {
          data = await getSafetyIncidents({
            status: filter === 'all' ? undefined : filter,
            search: search.trim() || undefined,
          })
        }
        setIncidents(Array.isArray(data?.incidents) ? data.incidents : [])
        if (data?.summary) {
          setSummary(data.summary)
        }
        if (isDefault && data) {
          setSafetyCache(data)
        }
        setLastUpdated(new Date())
      } catch (error) {
        if (!isBackground) {
          noticeRef.current(
            error instanceof Error ? error.message : 'Safety incidents could not be loaded.',
          )
        }
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [filter, search],
  )

  // Initial load & whenever filter or search changes
  useEffect(() => {
    void load()
  }, [load])

  // Real-time polling when autoRefresh is enabled
  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      void load(true)
    }, 10000)
    return () => window.clearInterval(interval)
  }, [autoRefresh, load])

  const submitResolution = async (reportId: string, status: string, notes: string) => {
    setBusyIncidentId(reportId)
    try {
      await resolveSafetyIncident(reportId, status, notes)
      noticeRef.current(
        status === 'resolved'
          ? 'Safety incident resolved and rider notified.'
          : 'Safety incident status updated.',
      )
      await load()
    } catch (error) {
      noticeRef.current(
        error instanceof Error ? error.message : 'Could not save incident resolution.',
      )
      throw error
    } finally {
      setBusyIncidentId(null)
    }
  }

  const submitContactLog = async (
    reportId: string,
    outcome: 'contacted' | 'no_answer' | 'escalated',
    notes: string,
    roleLabel: string,
  ) => {
    setBusyIncidentId(reportId)
    try {
      let status = 'underReview'
      let outcomeLabel = 'Mark Contacted - Responded'
      if (outcome === 'no_answer') {
        status = 'waitingForInformation'
        outcomeLabel = 'No Answer - Try again later'
      } else if (outcome === 'escalated') {
        status = 'escalated'
        outcomeLabel = 'Escalate - Notify dispatch'
      }

      const logHeader = `[Contact Log: ${outcomeLabel}]`
      const fullNotes = notes.trim()
        ? `${logHeader}\n${notes.trim()}`
        : `${logHeader} Attempted call from desktop dashboard.`

      await resolveSafetyIncident(reportId, status, fullNotes)
      noticeRef.current(`Contact log recorded for ${roleLabel.toLowerCase()}.`)
      await load()
    } catch (error) {
      noticeRef.current(
        error instanceof Error ? error.message : 'Could not save contact log.',
      )
      throw error
    } finally {
      setBusyIncidentId(null)
    }
  }

  return {
    autoRefresh,
    busyIncidentId,
    filter,
    incidents,
    isLoading,
    isRefreshing,
    lastUpdated,
    load,
    search,
    selectedIncident,
    setAutoRefresh,
    setFilter,
    setSearch,
    setSelectedIncident,
    submitContactLog,
    submitResolution,
    summary,
  }
}
