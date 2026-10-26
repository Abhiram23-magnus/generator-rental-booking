import { anonKey, functionsUrl, supabase } from './supabase'
import type {
  AdminBookingDetail, AdminBookingRow, AdminCustomerDetail, AdminCustomerRow, AdminGenerator, AdminSettings,
  BookingQuote, DashboardStats, Generator, GeneratorListing, PublicSettings, Receipt,
} from './types'

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const FALLBACK: Record<string, string> = {
  UNAUTHORIZED: 'Your admin session has ended. Enter your PIN again.',
  SLOT_TAKEN: 'This generator is already booked for part of that period. Choose another time or generator.',
  NETWORK: 'The booking server could not be reached. Check your internet connection and try again.',
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let result
  try {
    result = await supabase.rpc(fn, args)
  } catch {
    throw new ApiError('NETWORK', FALLBACK.NETWORK)
  }
  const { data, error } = result
  if (error) {
    const known = /^[A-Z_]+$/.test(error.message)
    const code = known ? error.message : /fetch|network/i.test(error.message) ? 'NETWORK' : 'SERVER'
    if (code === 'UNAUTHORIZED') onUnauthorized?.()
    throw new ApiError(code, (known && error.details) || FALLBACK[code] || 'Something went wrong on the server. Try again in a moment.')
  }
  return data as T
}

// ---------- public ----------
export const api = {
  publicSettings: () => call<PublicSettings>('get_public_settings'),
  listGenerators: (start?: Date | null, end?: Date | null) =>
    call<GeneratorListing[]>('list_generators', { p_start: start?.toISOString() ?? null, p_end: end?.toISOString() ?? null }),
  quote: (generatorId: string, start: Date, end: Date) =>
    call<BookingQuote>('get_booking_quote', { p_generator_id: generatorId, p_start: start.toISOString(), p_end: end.toISOString() }),
  createBooking: (b: {
    generator_id: string; start_at: string; end_at: string; full_name: string; mobile_number: string
    email?: string; rental_location: string; landmark?: string; notes?: string
  }) => call<Receipt>('create_booking', { p_booking: b }),
  receipt: (reference: string, token: string) => call<Receipt | null>('get_booking_receipt', { p_reference: reference, p_token: token }),
  findBooking: (reference: string, mobile: string) => call<Receipt | null>('find_booking', { p_reference: reference, p_mobile: mobile }),
}

// ---------- admin ----------
export type LoginResult =
  | { ok: true; token: string; idle_timeout_minutes: number }
  | { ok: false; error: 'INVALID_PIN' | 'INVALID_FORMAT' | 'LOCKED' | 'NOT_CONFIGURED'; attempts_remaining?: number; retry_after_seconds?: number }

export type ChangePinResult = { ok: true; token: string } | { ok: false; error: 'INVALID_PIN' | 'INVALID_FORMAT' | 'SAME_PIN' | 'WEAK_PIN' }

export const adminApi = {
  login: (pin: string) => call<LoginResult>('admin_login', { p_pin: pin }),
  session: (t: string) => call<{ ok: true; idle_timeout_minutes: number }>('admin_session', { p_token: t }),
  logout: (t: string) => call<{ ok: true }>('admin_logout', { p_token: t }),
  changePin: (t: string, current: string, next: string) =>
    call<ChangePinResult>('admin_change_pin', { p_token: t, p_current_pin: current, p_new_pin: next }),
  stats: (t: string, from: string, to: string, basis: 'booked' | 'completed') =>
    call<DashboardStats>('admin_dashboard_stats', { p_token: t, p_from: from, p_to: to, p_revenue_basis: basis }),
  generators: (t: string) => call<AdminGenerator[]>('admin_list_generators', { p_token: t }),
  saveGenerator: (t: string, g: Partial<Generator>) => call<Generator>('admin_save_generator', { p_token: t, p_generator: g }),
  setGeneratorActive: (t: string, id: string, active: boolean) =>
    call<Generator>('admin_set_generator_active', { p_token: t, p_generator_id: id, p_active: active }),
  removeGenerator: (t: string, id: string) => call<{ action: 'deleted' | 'archived' }>('admin_remove_generator', { p_token: t, p_generator_id: id }),
  bookings: (t: string, f: { search?: string; status?: string; generatorId?: string; date?: string; limit?: number; offset?: number }) =>
    call<{ total: number; rows: AdminBookingRow[] }>('admin_list_bookings', {
      p_token: t, p_search: f.search || null, p_status: f.status || null, p_generator_id: f.generatorId || null,
      p_date: f.date || null, p_limit: f.limit ?? 50, p_offset: f.offset ?? 0,
    }),
  booking: (t: string, id: string) => call<AdminBookingDetail>('admin_get_booking', { p_token: t, p_booking_id: id }),
  setBookingStatus: (t: string, id: string, status: string, note?: string) =>
    call<AdminBookingDetail>('admin_update_booking_status', { p_token: t, p_booking_id: id, p_status: status, p_note: note ?? null }),
  reschedule: (t: string, id: string, start: Date, end: Date) =>
    call<AdminBookingDetail>('admin_reschedule_booking', { p_token: t, p_booking_id: id, p_start: start.toISOString(), p_end: end.toISOString() }),
  calendar: (t: string, from: Date, to: Date, generatorId?: string) =>
    call<AdminBookingRow[]>('admin_calendar', { p_token: t, p_from: from.toISOString(), p_to: to.toISOString(), p_generator_id: generatorId || null }),
  customers: (t: string, search?: string) => call<AdminCustomerRow[]>('admin_list_customers', { p_token: t, p_search: search || null, p_limit: 200 }),
  customer: (t: string, id: string) => call<AdminCustomerDetail>('admin_get_customer', { p_token: t, p_customer_id: id }),
  updateCustomer: (t: string, id: string, c: { full_name: string; mobile_number: string; email: string }) =>
    call<AdminCustomerDetail>('admin_update_customer', { p_token: t, p_customer_id: id, p_customer: c }),
  settings: (t: string) => call<AdminSettings>('admin_get_settings', { p_token: t }),
  updateSettings: (t: string, s: Partial<AdminSettings>) => call<AdminSettings>('admin_update_settings', { p_token: t, p_settings: s }),

  async uploadImage(t: string, file: File): Promise<string> {
    let res: Response
    try {
      res = await fetch(`${functionsUrl}/admin-upload-image`, {
        method: 'POST',
        headers: { 'content-type': file.type, 'x-admin-token': t, apikey: anonKey, authorization: `Bearer ${anonKey}` },
        body: file,
      })
    } catch {
      throw new ApiError('NETWORK', FALLBACK.NETWORK)
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) onUnauthorized?.()
      throw new ApiError(body.error ?? 'UPLOAD_FAILED', body.message ?? 'The image could not be uploaded.')
    }
    return body.url as string
  },
}
