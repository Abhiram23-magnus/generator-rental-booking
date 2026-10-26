import { describe, expect, it } from 'vitest'
import { computeQuote, formatDuration } from './pricing'
import type { Pricing } from './types'

const plain: Pricing = {
  billing_mode: 'exact', minimum_billable_hours: 0, delivery_charge: 0, delivery_charge_label: 'Delivery',
  discount_percent: 0, discount_label: 'Discount', tax_percent: 0, tax_label: 'GST', time_zone: 'Asia/Kolkata',
}
const at = (iso: string) => new Date(iso)

describe('computeQuote', () => {
  const rates: [number, number, number][] = [[25, 2500, 2.5], [30, 3000, 3], [40, 4000, 4], [50, 5000, 5], [62, 6000, 6], [82, 8000, 8], [125, 10000, 10]]

  it.each(rates)('%s kVA for 8 hours', (_kva, rate, lph) => {
    const q = computeQuote(at('2026-11-01T10:00:00+05:30'), at('2026-11-01T18:00:00+05:30'), rate, lph, plain)
    expect(q.rental_charge).toBe(rate * 8)
    expect(q.total_amount).toBe(rate * 8)
    expect(q.estimated_diesel_litres).toBe(lph * 8)
    expect(q.additional_charges + q.discount + q.tax).toBe(0)
  })

  it('charges partial hours proportionally', () => {
    const q = computeQuote(at('2026-11-01T10:00:00+05:30'), at('2026-11-01T18:30:00+05:30'), 2500, 2.5, plain)
    expect(q.duration_hours).toBe(8.5)
    expect(q.rental_charge).toBe(21250)
    expect(q.estimated_diesel_litres).toBe(21.25)
    const odd = computeQuote(at('2026-11-01T10:00:00+05:30'), at('2026-11-01T10:07:00+05:30'), 2500, 2.5, plain)
    expect(odd.rental_charge).toBe(291.67)
    expect(odd.estimated_diesel_litres).toBe(0.29)
  })

  it('handles midnight and multi-day rentals', () => {
    expect(computeQuote(at('2026-11-01T22:00:00+05:30'), at('2026-11-02T06:00:00+05:30'), 4000, 4, plain).rental_charge).toBe(32000)
    const q = computeQuote(at('2026-11-01T08:00:00+05:30'), at('2026-11-03T12:00:00+05:30'), 10000, 10, plain)
    expect(q.duration_hours).toBe(52)
    expect(q.total_amount).toBe(520000)
    expect(q.estimated_diesel_litres).toBe(520)
  })

  it('applies rounding, minimum hours, delivery, discount and tax only when configured', () => {
    const p: Pricing = { ...plain, billing_mode: 'round_up_hour', minimum_billable_hours: 4, delivery_charge: 1500, discount_percent: 10, tax_percent: 18 }
    const q = computeQuote(at('2026-11-01T10:00:00+05:30'), at('2026-11-01T12:10:00+05:30'), 2500, 2.5, p)
    expect(q.billable_hours).toBe(4)
    expect(q.rental_charge).toBe(10000)
    expect(q.additional_charges).toBe(1500)
    expect(q.discount).toBe(1150)
    expect(q.tax).toBe(1863)
    expect(q.total_amount).toBe(12213)
    expect(q.estimated_diesel_litres).toBe(5.42)
    const half = computeQuote(at('2026-11-01T10:00:00+05:30'), at('2026-11-01T12:10:00+05:30'), 2500, 2.5, { ...plain, billing_mode: 'round_up_half_hour' })
    expect(half.billable_hours).toBe(2.5)
  })

  it('refuses an end before the start', () => {
    expect(() => computeQuote(at('2026-11-01T10:00:00Z'), at('2026-11-01T09:00:00Z'), 2500, 2.5, plain)).toThrow()
    expect(() => computeQuote(at('2026-11-01T10:00:00Z'), at('2026-11-01T10:00:00Z'), 2500, 2.5, plain)).toThrow()
  })
})

describe('formatDuration', () => {
  it.each([
    [8 * 3600, '8 hours'],
    [8.5 * 3600, '8 hours 30 minutes'],
    [28 * 3600, '1 day 4 hours'],
    [3600, '1 hour'],
    [45 * 60, '45 minutes'],
    [2 * 86400 + 60, '2 days 1 minute'],
  ])('%s seconds reads "%s"', (s, text) => expect(formatDuration(s)).toBe(text))
})
