import { useMemo, useState } from 'react'
import type { PaymentFilter, PaymentRecord } from '../../types/dashboard'
import { createdRecordToPayment } from '../../utils/paymentWorkspace'
import type { PaymentWorkspaceProps } from './paymentWorkspace.types'
import {
  createMethodMetrics,
  createPaymentSummary,
  createSettlementItems,
  getPaymentAmount,
} from './paymentWorkspace.metrics'

export const PAYMENT_FILTERS: PaymentFilter[] = ['All', 'Completed', 'Pending', 'Failed']
export const PAYMENT_PAGE_SIZE = 5

export function usePaymentWorkspace(props: PaymentWorkspaceProps) {
  const [activeFilter, setActiveFilter] = useState<PaymentFilter>('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
  const [managedPayment, setManagedPayment] = useState<PaymentRecord | null>(null)
  const payments = useMemo(
    () => [...props.created.map(createdRecordToPayment), ...props.payments],
    [props.created, props.payments],
  )
  const summaryCards = useMemo(() => createPaymentSummary(payments), [payments])
  const methodMetrics = useMemo(() => createMethodMetrics(payments), [payments])
  const settlementItems = useMemo(() => createSettlementItems(payments), [payments])
  const nextReleaseAmount = payments
    .filter((payment) => payment.status === 'Completed')
    .reduce((total, payment) => total + getPaymentAmount(payment), 0)
  const visiblePayments = useMemo(() => {
    const query = props.search.toLowerCase().trim()
    return payments.filter((payment) => {
      const matchesFilter = activeFilter === 'All' || payment.status === activeFilter
      const matchesCompleted = !props.activeOnly || payment.status === 'Completed'
      const matchesSearch =
        !query ||
        `${payment.id} ${payment.order} ${payment.customer} ${payment.method} ${payment.status} ${payment.amount}`
          .toLowerCase()
          .includes(query)
      return matchesFilter && matchesCompleted && matchesSearch
    })
  }, [activeFilter, payments, props.activeOnly, props.search])
  const totalPages = Math.max(1, Math.ceil(visiblePayments.length / PAYMENT_PAGE_SIZE))
  const activePage = Math.min(currentPage, totalPages)
  const pagePayments = visiblePayments.slice(
    (activePage - 1) * PAYMENT_PAGE_SIZE,
    activePage * PAYMENT_PAGE_SIZE,
  )
  return {
    activeFilter,
    activePage,
    managedPayment,
    methodMetrics,
    nextReleaseAmount,
    pagePayments,
    selectedPayment,
    setActiveFilter,
    setCurrentPage,
    setManagedPayment,
    setSelectedPayment,
    settlementItems,
    summaryCards,
    totalPages,
    visiblePayments,
  }
}

export type PaymentWorkspaceState = ReturnType<typeof usePaymentWorkspace>
