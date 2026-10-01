export type SafetyIncidentStatus =
  | 'submitted'
  | 'underReview'
  | 'waitingForInformation'
  | 'resolved'
  | 'rejected'
  | 'escalated'

export type SafetyFilterTab =
  | 'all'
  | 'emergency'
  | 'accidents'
  | 'vehicle'
  | 'underReview'
  | 'resolved'

export type SafetyIncidentRider = {
  full_name: string
  first_name?: string
  last_name?: string
  contact_number?: string
  email?: string
  vehicle_type?: string
  plate_number?: string
  profile_photo_url?: string
}

export type SafetyIncidentDelivery = {
  delivery_id: number
  order_id: number
  delivery_status: string
  pickup_location?: string
  dropoff_location?: string
}

export type SafetyIncidentReporter = {
  role: 'rider' | 'buyer' | 'farmer' | string
  name: string
  contact_number?: string
  email?: string
  profile_photo_url?: string
}

export type SafetyIncident = {
  report_id: string
  rider_id: string | null
  delivery_id: number | null
  order_id?: number | null
  report_type: 'safety_action' | 'safety_report' | 'pickup_problem' | 'destination_problem' | 'delivery_problem' | string
  category: string
  stage: string | null
  description: string
  latitude: number | null
  longitude: number | null
  accuracy_meters: number | null
  attachments: string[]
  requested_actions: string[]
  status: SafetyIncidentStatus
  reported_at: string
  created_at: string
  updated_at: string
  resolution_notes?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
  reporter_role?: 'rider' | 'buyer' | 'farmer' | string
  reporter_name?: string
  reporter_contact?: string
  reporter_email?: string
  reporter?: SafetyIncidentReporter | null
  rider?: SafetyIncidentRider | null
  delivery?: SafetyIncidentDelivery | null
}

export type SafetyIncidentSummary = {
  total_incidents: number
  open_emergencies: number
  active_accidents: number
  under_review: number
  resolved: number
}

export type SafetyIncidentsResponse = {
  incidents: SafetyIncident[]
  summary: SafetyIncidentSummary
}
