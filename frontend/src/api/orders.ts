import { requestAdminApi } from './adminAuth'
import type { OrderDetail } from '../types/dashboard'

export const fetchOrderDetail = async (id: string, signal?: AbortSignal) =>
  (await requestAdminApi(`/api/admin/orders/${encodeURIComponent(id.replace(/\D/g, ''))}`, {
    signal,
  })) as OrderDetail

export const saveOrderAction = async (body: Record<string, unknown>) =>
  (await requestAdminApi('/api/admin/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as OrderDetail

export type CreateManualOrderItem = {
  commodity_id: number | string
  quantity: number
}

export type CreateManualOrderInput = {
  buyer_user_id?: string | number
  customer_name?: string
  customer_email?: string
  contact_number: string
  delivery_address: string
  delivery_latitude?: number
  delivery_longitude?: number
  items: CreateManualOrderItem[]
  payment_method: 'cash_on_delivery' | 'gcash'
  payment_reference?: string
  payment_verified?: boolean
  notes?: string
}

export const createManualOrder = async (input: CreateManualOrderInput) =>
  (await requestAdminApi('/api/admin/orders', {
    method: 'POST',
    body: JSON.stringify({
      action: 'create_manual_order',
      command_id: `cmd-create-order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...input,
    }),
  })) as OrderDetail
