import { useCallback, useMemo, useState } from 'react'
import type { GlobalIssue, GlobalIssuePayload } from '../../types/globalIssue'

export function resolveActiveGlobalIssue(
  reportedIssues: Record<string, GlobalIssuePayload | null>,
  databaseError: string,
  onRefreshDatabase: () => Promise<unknown>,
  dismissedIssueIds: Record<string, boolean>,
): GlobalIssue | null {
  const active = Object.entries(reportedIssues).find(([_, iss]) => iss !== null)
  if (active && active[1]) {
    const id = `${active[0]}-${active[1].title}`
    if (!dismissedIssueIds[id]) {
      return { ...active[1], id }
    }
  }
  if (databaseError) {
    const id = `db-${databaseError}`
    if (!dismissedIssueIds[id]) {
      return {
        actionLabel: 'Retry Sync',
        category: 'Marketplace',
        id,
        level: 'error',
        message: databaseError,
        onAction: async () => {
          try {
            await onRefreshDatabase()
          } catch {
            // Handled: databaseError state is updated by useAdminDatabase
          }
        },
        title: 'Marketplace Data Sync Interrupted',
      }
    }
  }
  return null
}

export function useGlobalIssues(
  databaseError: string,
  onRefreshDatabase: () => Promise<unknown>,
) {
  const [reportedIssues, setReportedIssues] = useState<
    Record<string, GlobalIssuePayload | null>
  >({})
  const [dismissedIssueIds, setDismissedIssueIds] = useState<Record<string, boolean>>({})

  const reportGlobalIssue = useCallback(
    (source: string, issue: GlobalIssuePayload | null) => {
      setReportedIssues((prev) => {
        if (prev[source] === issue) return prev
        if (!prev[source] && !issue) return prev
        if (
          prev[source] &&
          issue &&
          prev[source].title === issue.title &&
          prev[source].message === issue.message &&
          prev[source].level === issue.level
        ) {
          return prev
        }
        return { ...prev, [source]: issue }
      })
    },
    [],
  )

  const baseIssue = useMemo(
    () =>
      resolveActiveGlobalIssue(
        reportedIssues,
        databaseError,
        onRefreshDatabase,
        dismissedIssueIds,
      ),
    [databaseError, onRefreshDatabase, dismissedIssueIds, reportedIssues],
  )

  const globalIssue = useMemo<GlobalIssue | null>(() => {
    if (!baseIssue) return null
    return {
      ...baseIssue,
      onDismiss: () =>
        setDismissedIssueIds((prev) => ({ ...prev, [baseIssue.id]: true })),
    }
  }, [baseIssue])

  const dismissGlobalIssue = () => {
    if (globalIssue) {
      setDismissedIssueIds((prev) => ({ ...prev, [globalIssue.id]: true }))
    }
  }

  return { dismissGlobalIssue, globalIssue, reportGlobalIssue }
}
