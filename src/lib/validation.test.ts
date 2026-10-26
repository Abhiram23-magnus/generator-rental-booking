import { describe, expect, it } from 'vitest'
import { bookingFormSchema, normalizeMobile, validatePeriod } from './validation'
import { defaultRentalPeriod, zonedToDate } from './time'

describe('normalizeMobile', () => {
  it.each(['9876543210', '+919876543210', '+91 98765 43210', '+91-98765-43210', '919876543210', '09876543210', '(98765) 43210'])('accepts %s', (v) =>
    expect(normalizeMobile(v)).toBe('9876543210'))
  it.each(['', '12345', '5876543210', '98765432101', '+1 9876543210', 'abcdefghij', '+92 9876543210'])('rejects "%s"', (v) =>
    expect(normalizeMobile(v)).toBeNull())
})

describe('booking form', () => {
  const base = {
    full_name: 'Ravi Kumar', mobile_number: '+91 98765 43210', email: '', rental_location: '12 MG Road, Bengaluru',
    landmark: '', notes: '', start_date: '2026-11-01', start_time: '10:00', end_date: '2026-11-01', end_time: '18:00',
  }
  it('accepts a complete form with optional fields empty', () => expect(bookingFormSchema.safeParse(base).success).toBe(true))
  it('rejects a bad mobile, a bad email and a short address', () => {
    expect(bookingFormSchema.safeParse({ ...base, mobile_number: '12345' }).success).toBe(false)
    expect(bookingFormSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false)
    expect(bookingFormSchema.safeParse({ ...base, rental_location: 'x' }).success).toBe(false)
    expect(bookingFormSchema.safeParse({ ...base, full_name: ' ' }).success).toBe(false)
  })
})

describe('rental periods', () => {
  const now = new Date('2026-11-01T04:30:00Z') // 10:00 IST
  it('converts business-time entries across midnight', () => {
    const s = zonedToDate('2026-11-01', '22:00', 'Asia/Kolkata')!
    const e = zonedToDate('2026-11-02', '06:00', 'Asia/Kolkata')!
    expect(s.toISOString()).toBe('2026-11-01T16:30:00.000Z')
    expect((e.getTime() - s.getTime()) / 3600_000).toBe(8)
  })
  it('flags missing, reversed, past and over-long periods', () => {
    const z = (d: string, t: string) => zonedToDate(d, t, 'Asia/Kolkata')
    expect(validatePeriod(null, z('2026-11-01', '12:00'), { now })).toBe('missing')
    expect(validatePeriod(z('2026-11-01', '12:00'), z('2026-11-01', '11:00'), { now })).toBe('reversed')
    expect(validatePeriod(z('2026-11-01', '12:00'), z('2026-11-01', '12:00'), { now })).toBe('reversed')
    expect(validatePeriod(z('2026-11-01', '08:00'), z('2026-11-01', '12:00'), { now })).toBe('past')
    expect(validatePeriod(z('2026-11-01', '12:00'), z('2027-01-30', '12:00'), { now, maxDays: 60 })).toBe('too_long')
    expect(validatePeriod(z('2026-11-01', '12:00'), z('2026-11-01', '20:00'), { now, maxDays: 60 })).toBeNull()
    expect(validatePeriod(z('2026-11-01', '10:20'), z('2026-11-01', '20:00'), { now, minLeadMinutes: 60 })).toBe('past')
  })
  it('defaults to the next full hour for eight hours', () => {
    const d = defaultRentalPeriod('Asia/Kolkata', new Date('2026-11-01T04:47:00Z')) // 10:17 IST
    expect(d).toEqual({ start: { date: '2026-11-01', time: '11:00' }, end: { date: '2026-11-01', time: '19:00' } })
  })
})
