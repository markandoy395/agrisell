import type { UserWorkspaceSummaryCard } from '../../../types/dashboard'
import { WorkspaceStatsGrid } from '../workspaceStats/WorkspaceStatsGrid'

type UserSummaryGridProps = {
  ariaLabel?: string
  cards: UserWorkspaceSummaryCard[]
}

export function UserSummaryGrid({ ariaLabel = 'Users summary', cards }: UserSummaryGridProps) {
  return <WorkspaceStatsGrid ariaLabel={ariaLabel} cards={cards} />
}
