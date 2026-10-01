import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/ui/icon/Icon'
import { fetchFarmerRiderRequests } from '../../api/deliveries'
import { RiderTracking } from './RiderTracking'
import { FarmerRiderRequestsPanel } from './FarmerRiderRequestsPanel'
import { DeliveryActionMenu } from './DeliveryActionMenu'
import { DeliveryConfirmationOverlays } from './DeliveryConfirmationOverlays'
import { DeliveryCreateForm } from './DeliveryCreateForm'
import { DeliveryDetailOverlays } from './DeliveryDetailOverlays'
import { DeliveryFilters } from './DeliveryFilters'
import { DeliveryHeader } from './DeliveryHeader'
import { DeliverySummary } from './DeliverySummary'
import { DeliveryTable } from './DeliveryTable'
import { useDeliveryActions } from './useDeliveryActions'
import { useDeliveryData } from './useDeliveryData'
import type { EntityRecord } from '../../types/dashboard'
import type { GlobalIssuePayload } from '../../types/globalIssue'
import type { FarmerRiderRequest } from '../../types/delivery'
import '../orderWorkspace/OrderWorkspace.css'
import './DeliveryWorkspace.css'

type DeliveryWorkspaceProps = {
  search: string
  fallbackRecords?: EntityRecord[]
  onNotice?: (message: string) => void
  onDataChanged?: () => void
  onReportIssue?: (issue: GlobalIssuePayload | null) => void
  initialDeliveryId?: number | null
  onInitialDeliveryOpened?: () => void
}

export function DeliveryWorkspace({
  search,
  fallbackRecords,
  onNotice,
  onDataChanged,
  onReportIssue,
  initialDeliveryId,
  onInitialDeliveryOpened,
}: DeliveryWorkspaceProps) {
  const [view, setView] = useState<'list' | 'tracking' | 'farmer-requests'>('list')
  const [trackedId, setTrackedId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [farmerRequests, setFarmerRequests] = useState<FarmerRiderRequest[]>([])
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0)
  const data = useDeliveryData(search, fallbackRecords)
  const actions = useDeliveryActions({
    data,
    initialDeliveryId,
    onDataChanged,
    onNotice,
  })

  useEffect(() => {
    let active = true
    void fetchFarmerRiderRequests()
      .then((res) => {
        if (!active) return
        setFarmerRequests(res.rows)
        setPendingRequestsCount(res.pending_count)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [data.reload])

  useEffect(() => {
    if (!initialDeliveryId || data.loading) return
    if (!data.deliveries.some((delivery) => delivery.delivery_id === initialDeliveryId)) return
    onInitialDeliveryOpened?.()
  }, [data.deliveries, data.loading, initialDeliveryId, onInitialDeliveryOpened])

  const reportIssueRef = useRef(onReportIssue)
  useEffect(() => {
    reportIssueRef.current = onReportIssue
  }, [onReportIssue])

  useEffect(() => {
    if (data.error) {
      reportIssueRef.current?.({
        actionLabel: 'Reload Deliveries',
        category: 'Delivery',
        level: 'error',
        message: data.error,
        onAction: data.refresh,
        title: 'Delivery Synchronization Issue',
      })
    } else {
      reportIssueRef.current?.(null)
    }
  }, [data.error, data.refresh])

  const handleCountsChanged = useCallback(({ pending }: { pending: number }) => {
    setPendingRequestsCount((prev) => (prev === pending ? prev : pending))
  }, [])

  const track = (id: number) => {
    setTrackedId(id)
    setView('tracking')
    actions.setSelectedId(null)
  }
  return (
    <section
      className="user-workspace delivery-workspace order-workspace"
      aria-labelledby="deliveries-title"
    >
      <DeliveryHeader data={data} onCreate={() => setCreating(true)} />
      <DeliverySummary data={data} />
      <div className="delivery-view-tabs" aria-label="Delivery views">
        <button
          type="button"
          aria-pressed={view === 'list'}
          onClick={() => {
            setView('list')
            data.refresh()
          }}
        >
          Delivery List
        </button>
        <button
          type="button"
          aria-pressed={view === 'tracking'}
          onClick={() => setView('tracking')}
        >
          Live Tracking
        </button>
        <button
          type="button"
          aria-pressed={view === 'farmer-requests'}
          onClick={() => setView('farmer-requests')}
        >
          Farmer Invitations
          {pendingRequestsCount > 0 && (
            <span className="pill-count" style={{ marginLeft: 6 }}>
              {pendingRequestsCount}
            </span>
          )}
        </button>
      </div>
      {view === 'tracking' ? (
        <RiderTracking search={search} selectedId={trackedId} onSelect={setTrackedId} />
      ) : view === 'farmer-requests' ? (
        <>
          <FarmerRiderRequestsPanel
            search={search}
            onAssignRider={(deliveryId, preferredRiderId) => {
              actions.openAssignmentForDelivery(deliveryId, preferredRiderId)
            }}
            onViewDelivery={(deliveryId) => {
              setView('list')
              actions.setSelectedMode('details')
              actions.setSelectedId(deliveryId)
            }}
            onCountsChanged={handleCountsChanged}
          />
          <DeliveryDetailOverlays
            actions={actions}
            data={data}
            farmerRequests={farmerRequests}
            onTrack={track}
          />
          <DeliveryConfirmationOverlays actions={actions} />
        </>
      ) : (
        <>
          {data.error && (
            <p role="alert" className="rider-tracking-error">
              {data.error}
            </p>
          )}
          {data.loading && (
            <div className="delivery-loading-popup" role="status" aria-live="polite">
              <Icon name="refresh" size={16} />
              <span>Loading deliveries…</span>
            </div>
          )}
          {creating && <DeliveryCreateForm data={data} onClose={() => setCreating(false)} />}
          <DeliveryFilters data={data} />
          <DeliveryTable actions={actions} data={data} farmerRequests={farmerRequests} />
          <DeliveryActionMenu actions={actions} />
          <DeliveryDetailOverlays
            actions={actions}
            data={data}
            farmerRequests={farmerRequests}
            onTrack={track}
          />
          <DeliveryConfirmationOverlays actions={actions} />
        </>
      )}
    </section>
  )
}
