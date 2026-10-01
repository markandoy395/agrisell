import { useState } from 'react'
import { Icon } from '../icon/Icon'
import type { GlobalIssue } from '../../../types/globalIssue'
import './GlobalIssueBanner.css'

type GlobalIssueBannerProps = {
  issue: GlobalIssue | null
  onDismiss?: () => void
}

export function GlobalIssueBanner({ issue, onDismiss }: GlobalIssueBannerProps) {
  const [isRetrying, setIsRetrying] = useState(false)

  if (!issue) return null

  const handleDismiss = () => {
    if (issue.onDismiss) issue.onDismiss()
    if (onDismiss) onDismiss()
  }

  const handleAction = async () => {
    if (!issue.onAction || isRetrying) return
    setIsRetrying(true)
    try {
      await issue.onAction()
    } catch {
      // Handled: action triggers state updates internally
    } finally {
      setIsRetrying(false)
    }
  }

  const categoryLabel = issue.category
    ? `${issue.category} ISSUE`
    : issue.level === 'error'
      ? 'SYSTEM ERROR'
      : issue.level === 'warning'
        ? 'SYSTEM WARNING'
        : 'SYSTEM NOTICE'

  return (
    <aside
      className={`global-issue-banner global-issue-banner--${issue.level}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="global-issue-content">
        <div className="global-issue-badge" aria-hidden="true">
          <Icon name="alert" size={20} />
        </div>
        <div className="global-issue-texts">
          <span className="global-issue-eyebrow">{categoryLabel}</span>
          <h4 className="global-issue-title">{issue.title}</h4>
          <p className="global-issue-message">{issue.message}</p>
        </div>
      </div>
      <div className="global-issue-actions">
        {issue.onAction && (
          <button
            type="button"
            className={`global-issue-btn-action${isRetrying ? ' is-retrying' : ''}`}
            disabled={isRetrying}
            onClick={handleAction}
          >
            <span className={isRetrying ? 'global-issue-spin' : undefined}>
              <Icon name="refresh" size={14} />
            </span>
            <span>{isRetrying ? 'Retrying…' : (issue.actionLabel ?? 'Retry')}</span>
          </button>
        )}
        {(onDismiss || issue.onDismiss) && (
          <button
            type="button"
            className="global-issue-btn-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss issue notification"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
    </aside>
  )
}
