import { useEffect, useState } from 'react'
import { saveDelivery } from '../../api/deliveries'
import { getApiErrorMessage } from '../../api/adminAuth'
import type { DeliveryDataState } from './useDeliveryData'

type ActionOptions = {
  data: DeliveryDataState
  initialDeliveryId?: number | null
  onDataChanged?: () => void
  onNotice?: (message: string) => void
}

export function useDeliveryActions({
  data,
  initialDeliveryId,
  onDataChanged,
  onNotice,
}: ActionOptions) {
  const [actionMenu, setActionMenu] = useState<{
    deliveryId: number
    top: number
    right: number
  } | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(initialDeliveryId ?? null)
  const [selectedMode, setSelectedMode] = useState<'details' | 'route' | 'manage'>(
    initialDeliveryId ? 'manage' : 'details',
  )
  const [completionId, setCompletionId] = useState<number | null>(null)
  const [completionError, setCompletionError] = useState('')
  const [completing, setCompleting] = useState(false)
  const [cancellationId, setCancellationId] = useState<number | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellationError, setCancellationError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [deletionId, setDeletionId] = useState<number | null>(null)
  const [deletionError, setDeletionError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [assignmentId, setAssignmentId] = useState<number | null>(null)
  const [assignmentRiderId, setAssignmentRiderId] = useState('')
  const [assignmentQuery, setAssignmentQuery] = useState('')
  const [assignmentError, setAssignmentError] = useState('')
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [reopeningId, setReopeningId] = useState<number | null>(null)

  const find = (id: number | null | undefined) =>
    data.deliveries.find((delivery) => delivery.delivery_id === id)
  const actionDelivery = find(actionMenu?.deliveryId)
  const selected = find(selectedId)
  const completionDelivery = find(completionId)
  const cancellationDelivery = find(cancellationId)
  const deletionDelivery = find(deletionId)
  const assignmentDelivery = find(assignmentId)
  const editDelivery = find(editId)

  useEffect(() => {
    if (!actionMenu) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionMenu(null)
    }
    const dismiss = () => setActionMenu(null)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('keydown', close)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [actionMenu])

  const openActions = (deliveryId: number, element: HTMLButtonElement) => {
    const box = element.getBoundingClientRect()
    setActionMenu((current) =>
      current?.deliveryId === deliveryId
        ? null
        : {
            deliveryId,
            top: Math.max(16, Math.min(box.bottom + 8, window.innerHeight - 388)),
            right: Math.max(16, window.innerWidth - box.right),
          },
    )
  }
  const selectFromMenu = (mode: 'details' | 'route') => {
    if (actionDelivery) {
      setSelectedMode(mode)
      setSelectedId(actionDelivery.delivery_id)
    }
    setActionMenu(null)
  }
  const openSimpleAction = (setter: (id: number) => void, clearError: () => void) => {
    if (actionDelivery) {
      setter(actionDelivery.delivery_id)
      clearError()
    }
    setActionMenu(null)
  }
  const openAssignment = () => {
    if (actionDelivery) {
      const suggested = data.options.riders.find(
        (candidate) =>
          candidate.rider_id !== actionDelivery.rider_id &&
          ['online', 'available'].includes(candidate.availability_status) &&
          candidate.active_deliveries < candidate.maximum_active_deliveries,
      )
      setAssignmentId(actionDelivery.delivery_id)
      setAssignmentRiderId(suggested?.rider_id || '')
      setAssignmentQuery('')
      setAssignmentError('')
    }
    setActionMenu(null)
  }
  const openAssignmentForDelivery = (deliveryId: number, preferredRiderId?: string) => {
    const target = data.deliveries.find((d) => d.delivery_id === deliveryId)
    if (!target) return
    const suggested = preferredRiderId
      ? data.options.riders.find((r) => r.rider_id === preferredRiderId)
      : data.options.riders.find(
          (candidate) =>
            candidate.rider_id !== target.rider_id &&
            ['online', 'available'].includes(candidate.availability_status) &&
            candidate.active_deliveries < candidate.maximum_active_deliveries,
        )
    setAssignmentId(target.delivery_id)
    setAssignmentRiderId(suggested?.rider_id || preferredRiderId || '')
    setAssignmentQuery('')
    setAssignmentError('')
    setActionMenu(null)
  }
  const saveAction = async (
    task: () => Promise<void>,
    setBusy: (busy: boolean) => void,
    setError: (error: string) => void,
    fallback: string,
  ) => {
    setBusy(true)
    setError('')
    try {
      await task()
      data.refresh()
    } catch (cause) {
      setError(getApiErrorMessage(cause, fallback))
    } finally {
      setBusy(false)
    }
  }
  const confirmAssignment = async () => {
    if (!assignmentDelivery || !assignmentRiderId) return
    await saveAction(
      async () => {
        await saveDelivery({
          action: 'assign',
          delivery_id: assignmentDelivery.delivery_id,
          previous_status: assignmentDelivery.delivery_status,
          previous_rider_id: assignmentDelivery.rider_id,
          rider_id: assignmentRiderId,
          reason: assignmentDelivery.rider_id ? 'Rider reassigned by administrator' : undefined,
          command_id: crypto.randomUUID(),
        })
        setAssignmentId(null)
      },
      setAssignmentSaving,
      setAssignmentError,
      'Could not assign this rider.',
    )
  }
  const confirmCompletion = async () => {
    if (!completionDelivery) return
    await saveAction(
      async () => {
        await saveDelivery({
          action: 'complete',
          delivery_id: completionDelivery.delivery_id,
          previous_status: completionDelivery.delivery_status,
          reason: 'Marked completed by administrator',
          command_id: crypto.randomUUID(),
        })
        setCompletionId(null)
        onNotice?.(`Order ORD-${completionDelivery.order_id} marked as completed.`)
        onDataChanged?.()
      },
      setCompleting,
      setCompletionError,
      'Could not mark this delivery as completed.',
    )
  }
  const confirmCancellation = async () => {
    if (!cancellationDelivery) return
    await saveAction(
      async () => {
        await saveDelivery({
          action: 'status',
          delivery_id: cancellationDelivery.delivery_id,
          previous_status: cancellationDelivery.delivery_status,
          status: 'cancelled',
          reason: cancellationReason.trim() || 'Cancelled by administrator',
          command_id: crypto.randomUUID(),
        })
        setCancellationId(null)
        setCancellationReason('')
        onNotice?.(`Delivery for order ORD-${cancellationDelivery.order_id} was cancelled.`)
        onDataChanged?.()
      },
      setCancelling,
      setCancellationError,
      'Could not cancel this delivery.',
    )
  }
  const confirmDeletion = async () => {
    if (!deletionDelivery) return
    await saveAction(
      async () => {
        await saveDelivery({
          action: 'delete',
          delivery_id: deletionDelivery.delivery_id,
          previous_status: deletionDelivery.delivery_status,
          command_id: crypto.randomUUID(),
        })
        setDeletionId(null)
        onNotice?.(`Order ORD-${deletionDelivery.order_id} was deleted.`)
        onDataChanged?.()
      },
      setDeleting,
      setDeletionError,
      'Could not delete this delivery.',
    )
  }
  const confirmEdit = async (values: {
    pickup: string
    destination: string
    schedule: string
    notes: string
  }) => {
    if (!editDelivery) return
    await saveAction(
      async () => {
        await saveDelivery({
          action: 'update',
          delivery_id: editDelivery.delivery_id,
          previous_status: editDelivery.delivery_status,
          pickup_location: values.pickup.trim(),
          dropoff_location: values.destination.trim(),
          scheduled_at: new Date(values.schedule).toISOString(),
          reason: values.notes.trim() || 'Delivery details updated by administrator',
          command_id: crypto.randomUUID(),
        })
        setEditId(null)
        onNotice?.(`Delivery for order ORD-${editDelivery.order_id} was updated.`)
        onDataChanged?.()
      },
      setEditSaving,
      setEditError,
      'Could not update this delivery.',
    )
  }
  const reopenDelivery = async () => {
    if (!actionDelivery || reopeningId !== null) return
    const delivery = actionDelivery
    setActionMenu(null)
    setReopeningId(delivery.delivery_id)
    try {
      await saveDelivery({
        action: 'reopen',
        delivery_id: delivery.delivery_id,
        previous_status: delivery.delivery_status,
        reason: 'Delivery workflow reopened by administrator',
        command_id: crypto.randomUUID(),
      })
      onNotice?.(`Delivery for order ORD-${delivery.order_id} is ready for reassignment.`)
      onDataChanged?.()
      data.refresh()
    } catch (cause) {
      onNotice?.(getApiErrorMessage(cause, 'Could not reopen this delivery.'))
    } finally {
      setReopeningId(null)
    }
  }

  return {
    actionDelivery,
    actionMenu,
    assignmentDelivery,
    assignmentError,
    assignmentQuery,
    assignmentRiderId,
    assignmentSaving,
    cancellationDelivery,
    cancellationError,
    cancellationReason,
    cancelling,
    completionDelivery,
    completionError,
    completing,
    confirmAssignment,
    confirmCancellation,
    confirmCompletion,
    confirmDeletion,
    confirmEdit,
    deletionDelivery,
    deletionError,
    deleting,
    editDelivery,
    editError,
    editSaving,
    openActions,
    openAssignment,
    openAssignmentForDelivery,
    openSimpleAction,
    selectFromMenu,
    selected,
    selectedMode,
    reopenDelivery,
    reopeningId,
    setActionMenu,
    setAssignmentError,
    setAssignmentId,
    setAssignmentQuery,
    setAssignmentRiderId,
    setCancellationError,
    setCancellationId,
    setCancellationReason,
    setCompletionError,
    setCompletionId,
    setDeletionError,
    setDeletionId,
    setEditError,
    setEditId,
    setSelectedId,
    setSelectedMode,
  }
}

export type DeliveryActionsState = ReturnType<typeof useDeliveryActions>
