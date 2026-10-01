export type GlobalIssueLevel = 'error' | 'warning' | 'info'

export type GlobalIssue = {
  id: string
  level: GlobalIssueLevel
  category?: string
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
}

export type GlobalIssuePayload = Omit<GlobalIssue, 'id'>
