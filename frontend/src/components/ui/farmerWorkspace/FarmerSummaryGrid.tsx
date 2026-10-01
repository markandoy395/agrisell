import type { FarmerSummaryCard } from '../../../types/dashboard'
import { WorkspaceStatsGrid } from '../workspaceStats/WorkspaceStatsGrid'

type FarmerSummaryGridProps = {
  cards: FarmerSummaryCard[]
}

export function FarmerSummaryGrid({ cards }: FarmerSummaryGridProps) {
  return <WorkspaceStatsGrid ariaLabel="Farmers summary" cards={cards} />
}
