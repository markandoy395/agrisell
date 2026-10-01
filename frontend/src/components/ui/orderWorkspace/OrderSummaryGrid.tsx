import type { OrderSummaryCard } from '../../../types/dashboard'
import { WorkspaceStatsGrid } from '../workspaceStats/WorkspaceStatsGrid'

type OrderSummaryGridProps = {
  cards: OrderSummaryCard[]
}

export function OrderSummaryGrid({ cards }: OrderSummaryGridProps) {
  return <WorkspaceStatsGrid ariaLabel="Order summary" cards={cards} />
}
