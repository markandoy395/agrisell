import { WorkspaceStatsGrid, type WorkspaceStat } from '../../components/ui/workspaceStats/WorkspaceStatsGrid'
import type { CommoditySummary } from '../../types/commodityWorkspace'

type CommodityHeaderSummaryProps = {
  summary: CommoditySummary
}

export function CommodityHeaderSummary({ summary }: CommodityHeaderSummaryProps) {
  const cards: WorkspaceStat[] = [
    {
      detail: 'Marketplace catalog total',
      icon: 'basket',
      label: 'Total products',
      trend: 'Live',
      value: summary.totalCount,
    },
    {
      accent: 'green',
      detail: 'Visible & buyable',
      icon: 'check',
      label: 'Available now',
      trend: 'Active',
      value: summary.availableCount,
    },
    {
      accent: 'soft',
      detail: `${summary.hiddenCount} hidden · ${summary.delistedCount} delisted`,
      icon: 'eyeOff',
      label: 'Moderated / Inactive',
      trend: 'Catalog',
      value: summary.hiddenCount + summary.delistedCount,
    },
    {
      accent: 'soft',
      detail: 'Requires farmer restock',
      icon: 'alert',
      label: 'Out of stock',
      trend: 'Depleted',
      value: summary.outOfStockCount,
    },
    {
      accent: 'lime',
      detail: `${summary.harvestedCount} harvested`,
      icon: 'sprout',
      label: 'Growing stage',
      trend: 'Pre-order',
      value: summary.growingCount,
    },
  ]

  return <WorkspaceStatsGrid ariaLabel="Commodities overview" cards={cards} />
}
