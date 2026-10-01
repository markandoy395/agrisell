export type TrackedRider = {
  rider_id: string
  rider_name: string
  rider_phone: string | null
  availability_status: string | null
  employment_status: string | null
  latitude: number | null
  longitude: number | null
  accuracy_meters: number | null
  location_updated_at: string | null
}
export type Delivery = {
  delivery_id: number
  order_id: number
  delivery_status: string
  created_at: string
  estimated_delivery_time: string | null
  actual_delivery_time: string | null
  pickup_location: string | null
  dropoff_location: string | null
  customer_name: string | null
  rider_id: string | null
  rider_name: string | null
  rider_phone: string | null
  pickup_contact: string | null
  dropoff_contact: string | null
  pickup_lat: number | null
  pickup_long: number | null
  dropoff_lat: number | null
  dropoff_long: number | null
  latitude: number | null
  longitude: number | null
  accuracy_meters: number | null
  location_updated_at: string | null
  total_weight_kg: number | null
  farmer_request?: FarmerRiderRequest | null
}
export type DeliveryOptions = {
  riders: {
    rider_id: string
    full_name: string
    contact_number: string
    vehicle_type: string
    availability_status: string
    active_deliveries: number
    maximum_active_deliveries: number
  }[]
  orders: { order_id: number; customer_name: string; destination: string }[]
}
export type HistoryPoint = {
  point_id: number
  rider_id: string
  latitude: number
  longitude: number
  captured_at: string
}
export type DeliveryDetail = {
  events: {
    idempotency_key: string
    previous_status: string | null
    new_status: string
    remarks: string | null
    changed_at: string
  }[]
  proofs: {
    proof_id: string
    proof_stage: string
    proof_type: string
    signed_path?: string
    image_error?: string
    remarks: string | null
    confirmed_at: string | null
    created_at: string
  }[]
  items: { name: string; quantity: number; total: number }[]
  history: HistoryPoint[]
}

export type FarmerRiderRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'failed'

export type FarmerRiderRequest = {
  request_id: string
  delivery_id: number
  seller_order_id: string
  order_id: number | null
  farmer_user_id: number
  farmer_name: string
  farmer_phone: string | null
  farmer_image_url: string | null
  farm_name: string | null
  farm_location: string | null
  rider_id: string
  rider_name: string
  rider_phone: string | null
  rider_vehicle_type: string | null
  rider_availability_status: string | null
  rider_photo_url: string | null
  status: FarmerRiderRequestStatus
  requested_schedule: string
  proposed_delivery_fee: number | null
  requested_at: string
  expires_at: string
  responded_at: string | null
  failure_reason: string | null
  delivery_status: string | null
  pickup_location: string | null
  dropoff_location: string | null
  customer_name: string | null
}

export type FarmerRiderRequestsResponse = {
  total: number
  pending_count: number
  accepted_count: number
  declined_count: number
  expired_count: number
  cancelled_count: number
  failed_count: number
  rows: FarmerRiderRequest[]
}

