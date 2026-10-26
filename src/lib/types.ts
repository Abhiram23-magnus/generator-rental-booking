export type Availability = 'available' | 'booked' | 'unavailable' | 'inactive'
export type BookingStatus = 'confirmed' | 'ongoing' | 'completed' | 'cancelled'
export type BillingMode = 'exact' | 'round_up_half_hour' | 'round_up_hour'

export interface Pricing {
  billing_mode: BillingMode
  minimum_billable_hours: number
  delivery_charge: number
  delivery_charge_label: string
  discount_percent: number
  discount_label: string
  tax_percent: number
  tax_label: string
  time_zone: string
}

export interface PublicSettings {
  business_name: string
  tagline: string
  contact_phone: string | null
  contact_whatsapp: string | null
  contact_email: string | null
  contact_address: string | null
  business_hours: string | null
  time_zone: string
  min_lead_minutes: number
  max_booking_days: number
  pricing: Pricing
}

export interface Generator {
  id: string
  name: string | null
  capacity_kva: number
  hourly_rental_rate: number
  diesel_consumption_lph: number
  image_url: string | null
  description: string | null
  is_active: boolean
  under_maintenance: boolean
  sort_order: number
}

export interface GeneratorListing extends Generator {
  availability: Availability
  booked_until: string | null
}

export interface AdminGenerator extends Generator {
  is_archived: boolean
  total_bookings: number
  upcoming_bookings: number
  created_at: string
  updated_at: string
}

export interface Quote {
  duration_seconds: number
  duration_hours: number
  billable_seconds: number
  billable_hours: number
  hourly_rate: number
  rental_charge: number
  additional_charges: number
  discount: number
  tax: number
  total_amount: number
  diesel_consumption_lph: number
  estimated_diesel_litres: number
}

export interface BookingQuote {
  generator: Generator
  availability: Availability
  booked_until: string | null
  pricing: Pricing
  quote: Quote
}

export interface Receipt {
  booking_reference: string
  receipt_token: string
  status: BookingStatus
  created_at: string
  start_at: string
  end_at: string
  customer: { full_name: string; mobile_number: string; email: string | null }
  generator: { name: string | null; capacity_kva: number }
  rental_location: string
  landmark: string | null
  notes: string | null
  duration_seconds: number
  duration_hours: number
  billable_hours: number
  hourly_rate: number
  rental_charge: number
  additional_charges: number
  discount: number
  tax: number
  total_amount: number
  diesel_consumption_lph: number
  estimated_diesel_litres: number
  pricing: Pricing
  business: {
    business_name: string
    contact_phone: string | null
    contact_email: string | null
    contact_address: string | null
    time_zone: string
  }
}

export interface AdminBookingRow {
  id: string
  booking_reference: string
  status: BookingStatus
  start_at: string
  end_at: string
  created_at: string
  generator_id: string
  generator_capacity: number
  customer_id: string
  customer_name: string
  customer_mobile: string
  rental_location: string
  duration_hours: number
  total_amount: number
  estimated_diesel_litres: number
}

export interface AdminBookingDetail extends Receipt {
  id: string
  generator_id: string
  customer_id: string
  events: { from_status: BookingStatus | null; to_status: BookingStatus; note: string | null; created_at: string }[]
}

export interface AdminCustomerRow {
  id: string
  full_name: string
  mobile_number: string
  email: string | null
  created_at: string
  bookings: number
  total_booked: number
  last_booking_at: string | null
}

export interface AdminCustomerDetail {
  id: string
  full_name: string
  mobile_number: string
  email: string | null
  created_at: string
  bookings: AdminBookingRow[]
}

export interface DashboardStats {
  total_generators: number
  active_generators: number
  upcoming_bookings: number
  confirmed_bookings: number
  ongoing_rentals: number
  completed_bookings: number
  cancelled_bookings: number
  todays_bookings: number
  period: { from: string; to: string; revenue_basis: 'booked' | 'completed' }
  period_bookings: number
  revenue: number
  rental_hours: number
  diesel_litres: number
  daily: { date: string; revenue: number; bookings: number }[]
  by_generator: { capacity_kva: number; revenue: number; bookings: number }[]
}

export interface AdminSettings {
  business_name: string
  tagline: string
  contact_phone: string | null
  contact_whatsapp: string | null
  contact_email: string | null
  contact_address: string | null
  business_hours: string | null
  time_zone: string
  billing_mode: BillingMode
  minimum_billable_hours: number
  delivery_charge_enabled: boolean
  delivery_charge: number
  delivery_charge_label: string
  discount_enabled: boolean
  discount_percent: number
  discount_label: string
  tax_enabled: boolean
  tax_percent: number
  tax_label: string
  min_lead_minutes: number
  max_booking_days: number
  admin_session_timeout_minutes: number
  updated_at: string
}
