import { WorkspaceStatsGrid } from '../../components/ui/workspaceStats/WorkspaceStatsGrid'
import { isClosed, isOverdue } from '../../utils/delivery'
import type { DeliveryDataState } from './useDeliveryData'

export function DeliverySummary({ data }: { data: DeliveryDataState }) {
  const cards = [
    {
      name: 'Total deliveries',
      value: data.deliveries.length,
      icon: 'truck' as const,
      tone: 'green',
      detail: 'All database deliveries',
    },
    {
      name: 'Active deliveries',
      value: data.deliveries.filter((item) => !isClosed(item.delivery_status)).length,
      icon: 'route' as const,
      tone: 'blue',
      detail: 'Currently in the delivery process',
    },
    {
      name: 'Unassigned',
      value: data.deliveries.filter((item) => !isClosed(item.delivery_status) && !item.rider_id)
        .length,
      icon: 'profile' as const,
      tone: 'red',
      detail: 'Waiting for a rider assignment',
    },
    {
      name: 'Overdue',
      value: data.deliveries.filter((item) => isOverdue(item, data.now)).length,
      icon: 'alert' as const,
      tone: 'orange',
      detail: 'Past the estimated arrival',
    },
  ]
  return (
    <WorkspaceStatsGrid
      ariaLabel="Delivery summary"
      cards={cards.map(({ name, value, icon, detail, tone }) => ({
        detail,
        icon,
        label: name,
        tone: tone as any,
        trend: 'Live',
        trendTone: 'green',
        value: value.toLocaleString('en-US'),
      }))}
    />
  )
}
