import type { Pricing, Quote } from './types'

// Mirrors public.app_compute_quote in the database. Money is computed in paise
// and diesel in centilitres so both sides round identically. The database
// always recomputes on booking; this copy only powers the instant on-screen estimate.

const toCents = (n: number) => Math.round(Number(n) * 100)

export function billableSeconds(durationSeconds: number, pricing: Pick<Pricing, 'billing_mode' | 'minimum_billable_hours'>) {
  let secs = durationSeconds
  if (pricing.billing_mode === 'round_up_hour') secs = Math.ceil(durationSeconds / 3600) * 3600
  else if (pricing.billing_mode === 'round_up_half_hour') secs = Math.ceil(durationSeconds / 1800) * 1800
  const minSecs = Math.round(Number(pricing.minimum_billable_hours || 0) * 3600)
  return Math.max(secs, minSecs)
}

export function computeQuote(
  start: Date,
  end: Date,
  hourlyRate: number,
  dieselLph: number,
  pricing: Pricing,
): Quote {
  const durationSeconds = Math.floor((end.getTime() - start.getTime()) / 1000)
  if (!(durationSeconds > 0)) throw new Error('The rental end must be later than the rental start.')

  const billSecs = billableSeconds(durationSeconds, pricing)
  const rentalPaise = Math.round((toCents(hourlyRate) * billSecs) / 3600)
  const extraPaise = toCents(pricing.delivery_charge || 0)
  const subtotal = rentalPaise + extraPaise
  const discountPaise = Math.round((subtotal * toCents(pricing.discount_percent || 0)) / 10000)
  const taxPaise = Math.round(((subtotal - discountPaise) * toCents(pricing.tax_percent || 0)) / 10000)
  const dieselCl = Math.round((toCents(dieselLph) * durationSeconds) / 3600)

  return {
    duration_seconds: durationSeconds,
    duration_hours: Math.round((durationSeconds / 3600) * 10000) / 10000,
    billable_seconds: billSecs,
    billable_hours: Math.round((billSecs / 3600) * 10000) / 10000,
    hourly_rate: Number(hourlyRate),
    rental_charge: rentalPaise / 100,
    additional_charges: extraPaise / 100,
    discount: discountPaise / 100,
    tax: taxPaise / 100,
    total_amount: (subtotal - discountPaise + taxPaise) / 100,
    diesel_consumption_lph: Number(dieselLph),
    estimated_diesel_litres: dieselCl / 100,
  }
}

/** "8 hours", "8 hours 30 minutes", "1 day 4 hours" */
export function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  const parts: string[] = []
  if (days) parts.push(part(days, 'day'))
  if (hours) parts.push(part(hours, 'hour'))
  if (minutes) parts.push(part(minutes, 'minute'))
  return parts.length ? parts.join(' ') : '0 minutes'
}

export const BILLING_MODE_LABELS: Record<Pricing['billing_mode'], string> = {
  exact: 'Exact time (charged per minute)',
  round_up_half_hour: 'Rounded up to the next half hour',
  round_up_hour: 'Rounded up to the next full hour',
}
