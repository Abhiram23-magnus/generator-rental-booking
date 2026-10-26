import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { DB_URL, adminToken, bookingPayload, expectRpcError, generatorId, hoursFromNow, pool, resetData, rpc, setupPin, sql } from './helpers'
import { computeQuote } from '../../src/lib/pricing'
import type { Pricing } from '../../src/lib/types'

beforeEach(resetData)
afterAll(() => pool.end())

describe('generator catalogue', () => {
  it('lists the seven initial generators with their hourly rates and diesel consumption', async () => {
    const list = await rpc<any[]>('list_generators')
    expect(list.map((g) => [Number(g.capacity_kva), Number(g.hourly_rental_rate), Number(g.diesel_consumption_lph)])).toEqual([
      [25, 2500, 2.5], [30, 3000, 3], [40, 4000, 4], [50, 5000, 5], [62, 6000, 6], [82, 8000, 8], [125, 10000, 10],
    ])
    expect(list.every((g) => g.availability === 'available')).toBe(true)
  })

  it('reports a generator as booked only for overlapping periods', async () => {
    const id = await generatorId(25)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(24), hoursFromNow(32)) })

    const tomorrow = await rpc<any[]>('list_generators', { p_start: hoursFromNow(26).toISOString(), p_end: hoursFromNow(28).toISOString() })
    const today = await rpc<any[]>('list_generators', { p_start: hoursFromNow(2).toISOString(), p_end: hoursFromNow(10).toISOString() })
    expect(tomorrow.find((g) => g.id === id).availability).toBe('booked')
    expect(tomorrow.find((g) => g.id === id).booked_until).toBeTruthy()
    expect(today.find((g) => g.id === id).availability).toBe('available')
  })
})

describe('quotes and booking totals', () => {
  it('charges 25 kVA for 8 hours at ₹20,000 with 20 litres of diesel', async () => {
    const id = await generatorId(25)
    const q = await rpc<any>('get_booking_quote', { p_generator_id: id, p_start: hoursFromNow(2).toISOString(), p_end: hoursFromNow(10).toISOString() })
    expect(Number(q.quote.duration_hours)).toBe(8)
    expect(Number(q.quote.rental_charge)).toBe(20000)
    expect(Number(q.quote.total_amount)).toBe(20000)
    expect(Number(q.quote.estimated_diesel_litres)).toBe(20)
    expect(Number(q.quote.additional_charges) + Number(q.quote.discount) + Number(q.quote.tax)).toBe(0)
  })

  it('prices partial hours proportionally, across midnight and across several days', async () => {
    const id = await generatorId(30)
    // 8 hours 30 minutes
    let q = await rpc<any>('get_booking_quote', { p_generator_id: id, p_start: hoursFromNow(5).toISOString(), p_end: hoursFromNow(13.5).toISOString() })
    expect(Number(q.quote.rental_charge)).toBe(25500)
    expect(Number(q.quote.estimated_diesel_litres)).toBe(25.5)

    // 22:00 to 06:00 IST next day is 8 hours
    q = await rpc<any>('get_booking_quote', { p_generator_id: id, p_start: '2099-03-10T22:00:00+05:30', p_end: '2099-03-11T06:00:00+05:30' })
    expect(Number(q.quote.duration_seconds)).toBe(8 * 3600)
    expect(Number(q.quote.rental_charge)).toBe(24000)

    // 1 day 4 hours
    q = await rpc<any>('get_booking_quote', { p_generator_id: id, p_start: '2099-03-10T08:00:00+05:30', p_end: '2099-03-11T12:00:00+05:30' })
    expect(Number(q.quote.duration_hours)).toBe(28)
    expect(Number(q.quote.rental_charge)).toBe(84000)
    expect(Number(q.quote.estimated_diesel_litres)).toBe(84)
  })

  it('applies configured rounding, minimum hours, delivery charge, discount and tax', async () => {
    await sql(`update public.business_settings set billing_mode = 'round_up_hour', minimum_billable_hours = 4,
      delivery_charge_enabled = true, delivery_charge = 1500, discount_enabled = true, discount_percent = 10,
      tax_enabled = true, tax_percent = 18`)
    const id = await generatorId(25)
    // 2h 10m -> rounded to 3h -> raised to the 4h minimum
    let q = await rpc<any>('get_booking_quote', { p_generator_id: id, p_start: '2099-01-01T10:00:00+05:30', p_end: '2099-01-01T12:10:00+05:30' })
    expect(Number(q.quote.billable_hours)).toBe(4)
    expect(Number(q.quote.rental_charge)).toBe(10000)
    expect(Number(q.quote.additional_charges)).toBe(1500)
    expect(Number(q.quote.discount)).toBe(1150)
    expect(Number(q.quote.tax)).toBe(1863)
    expect(Number(q.quote.total_amount)).toBe(12213)
    // diesel always assumes the scheduled time, not the billed time
    expect(Number(q.quote.estimated_diesel_litres)).toBe(5.42)

    // 5h 10m -> rounded up to 6h
    q = await rpc<any>('get_booking_quote', { p_generator_id: id, p_start: '2099-01-01T10:00:00+05:30', p_end: '2099-01-01T15:10:00+05:30' })
    expect(Number(q.quote.billable_hours)).toBe(6)
  })

  it('matches the browser estimate for many random periods and rules', async () => {
    const id = await generatorId(62)
    const modes: Pricing['billing_mode'][] = ['exact', 'round_up_half_hour', 'round_up_hour']
    for (let i = 0; i < 25; i++) {
      const mode = modes[i % 3]
      const pricing = { billing_mode: mode, minimum_billable_hours: i % 4, delivery_charge: (i * 137) % 900, discount_percent: (i * 7) % 15 + 0.5, tax_percent: i % 2 ? 18 : 12.5 }
      await sql(`update public.business_settings set billing_mode = $1, minimum_billable_hours = $2, delivery_charge_enabled = true,
        delivery_charge = $3, discount_enabled = true, discount_percent = $4, tax_enabled = true, tax_percent = $5`,
        [mode, pricing.minimum_billable_hours, pricing.delivery_charge, pricing.discount_percent, pricing.tax_percent])
      const start = new Date(Date.UTC(2099, 0, 1, 3, 17))
      const end = new Date(start.getTime() + (37 + i * 613) * 60_000)
      const q = await rpc<any>('get_booking_quote', { p_generator_id: id, p_start: start.toISOString(), p_end: end.toISOString() })
      const local = computeQuote(start, end, 6000, 6, { ...q.pricing })
      for (const k of ['rental_charge', 'additional_charges', 'discount', 'tax', 'total_amount', 'estimated_diesel_litres', 'billable_hours', 'duration_hours'] as const) {
        expect(local[k], `${k} case ${i}`).toBeCloseTo(Number(q.quote[k]), 6)
      }
    }
  })
})

describe('creating bookings', () => {
  it('stores the booking with a price and diesel snapshot and returns the receipt', async () => {
    const id = await generatorId(25)
    const r = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(11)) })
    expect(r.booking_reference).toMatch(/^GR\d{6}-[A-Z2-9]{5}$/)
    expect(r.receipt_token).toMatch(/^[0-9a-f]{36}$/)
    expect(r.status).toBe('confirmed')
    expect(r.customer).toEqual({ full_name: 'Ravi Kumar', mobile_number: '9876543210', email: 'ravi@example.com' })
    expect(Number(r.generator.capacity_kva)).toBe(25)
    expect(Number(r.hourly_rate)).toBe(2500)
    expect(Number(r.total_amount)).toBe(20000)
    expect(Number(r.estimated_diesel_litres)).toBe(20)
    expect(r.id).toBeUndefined()

    const [row] = await sql(`select * from public.bookings`)
    expect(Number(row.rental_charge_at_booking)).toBe(20000)
    expect(Number(row.diesel_consumption_lph_at_booking)).toBe(2.5)
    expect(Number(row.generator_capacity_at_booking)).toBe(25)
  })

  it('gives every booking a unique reference', async () => {
    const id = await generatorId(40)
    const refs = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const r = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(2 + i * 3), hoursFromNow(4 + i * 3)) })
      refs.add(r.booking_reference)
    }
    expect(refs.size).toBe(30)
  })

  it('rejects invalid mobile numbers and accepts the common Indian formats', async () => {
    const id = await generatorId(25)
    for (const bad of ['12345', '5876543210', '98765432100', '+1 9876543210', 'abcdefghij']) {
      await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(5), { mobile_number: bad }) }), 'VALIDATION')
    }
    let t = 3
    for (const good of ['9876543210', '+919876543210', '+91 98765-43210', '919876543210', '09876543210']) {
      const r = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(t), hoursFromNow(t + 1), { mobile_number: good }) })
      expect(r.customer.mobile_number).toBe('9876543210')
      t += 2
    }
    expect((await sql(`select count(*)::int as n from public.customers`))[0].n).toBe(1)
  })

  it('rejects reversed, zero-length, past and over-long periods', async () => {
    const id = await generatorId(25)
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(5), hoursFromNow(3)) }), 'INVALID_PERIOD')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(5), hoursFromNow(5)) }), 'INVALID_PERIOD')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(-3), hoursFromNow(2)) }), 'PAST_PERIOD')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(2), hoursFromNow(2 + 24 * 61)) }), 'TOO_LONG')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(2), hoursFromNow(4), { rental_location: 'x' }) }), 'VALIDATION')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(2), hoursFromNow(4), { full_name: ' ' }) }), 'VALIDATION')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(2), hoursFromNow(4), { email: 'not-an-email' }) }), 'VALIDATION')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload('not-a-uuid', hoursFromNow(2), hoursFromNow(4)) }), 'VALIDATION')
  })
})

describe('booking conflicts', () => {
  it('allows back-to-back bookings where one starts exactly when the other ends', async () => {
    const id = await generatorId(50)
    const t0 = hoursFromNow(4), t1 = hoursFromNow(12), t2 = hoursFromNow(20)
    await rpc('create_booking', { p_booking: bookingPayload(id, t0, t1) })
    await rpc('create_booking', { p_booking: bookingPayload(id, t1, t2, { mobile_number: '9123456780' }) })
    expect((await sql(`select count(*)::int as n from public.bookings`))[0].n).toBe(2)
  })

  it('rejects any overlap on the same generator', async () => {
    const id = await generatorId(50)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(10), hoursFromNow(20)) })
    for (const [a, b] of [[8, 11], [19, 22], [12, 14], [9, 21], [10, 20]]) {
      await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(a), hoursFromNow(b)) }), 'SLOT_TAKEN')
    }
  })

  it('allows different generators to be booked for the same period', async () => {
    const a = await generatorId(50), b = await generatorId(82)
    await rpc('create_booking', { p_booking: bookingPayload(a, hoursFromNow(10), hoursFromNow(20)) })
    await rpc('create_booking', { p_booking: bookingPayload(b, hoursFromNow(10), hoursFromNow(20)) })
    expect((await sql(`select count(*)::int as n from public.bookings`))[0].n).toBe(2)
  })

  it('lets only one of many simultaneous requests for the same slot succeed', async () => {
    const id = await generatorId(125)
    const start = hoursFromNow(30), end = hoursFromNow(38)
    const attempts = Array.from({ length: 12 }, (_, i) =>
      rpc('create_booking', { p_booking: bookingPayload(id, new Date(start.getTime() + i * 60_000), end, { mobile_number: `98765432${String(i).padStart(2, '0')}` }) })
        .then(() => 'ok', (e) => e.code))
    const results = await Promise.all(attempts)
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'SLOT_TAKEN')).toHaveLength(11)
    expect((await sql(`select count(*)::int as n from public.bookings where generator_id = $1`, [id]))[0].n).toBe(1)
  })

  it('blocks a direct insert that overlaps, even bypassing the booking function', async () => {
    const id = await generatorId(25)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(10), hoursFromNow(20)) })
    const client = new pg.Client({ connectionString: DB_URL })
    await client.connect()
    await expect(client.query(`insert into public.bookings
      select gen_random_uuid(), 'X-1', 'tok', customer_id, generator_id, start_at + interval '1 hour', end_at, rental_location, landmark, notes,
        duration_seconds, duration_hours, billable_hours, hourly_rate_at_booking, rental_charge_at_booking, additional_charges_at_booking,
        discount_at_booking, tax_at_booking, total_amount_at_booking, diesel_consumption_lph_at_booking, estimated_diesel_litres,
        generator_capacity_at_booking, pricing_snapshot, 'confirmed' from public.bookings limit 1`)).rejects.toThrow(/bookings_no_overlap/)
    await client.end()
  })

  it('releases the slot when a booking is cancelled, and refuses to restore it if the slot was taken', async () => {
    await setupPin()
    const token = await adminToken()
    const id = await generatorId(40)
    const first = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(10), hoursFromNow(20)) })
    const [{ id: firstId }] = await sql(`select id from public.bookings where booking_reference = $1`, [first.booking_reference])

    await rpc('admin_update_booking_status', { p_token: token, p_booking_id: firstId, p_status: 'cancelled' })
    const list = await rpc<any[]>('list_generators', { p_start: hoursFromNow(12).toISOString(), p_end: hoursFromNow(14).toISOString() })
    expect(list.find((g) => g.id === id).availability).toBe('available')

    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(12), hoursFromNow(14), { mobile_number: '9000000001' }) })
    await expectRpcError(rpc('admin_update_booking_status', { p_token: token, p_booking_id: firstId, p_status: 'confirmed' }), 'SLOT_TAKEN')
    // cancelled history is kept
    expect((await sql(`select status from public.bookings where id = $1`, [firstId]))[0].status).toBe('cancelled')
  })

  it('does not let completed bookings block future periods', async () => {
    await setupPin()
    const token = await adminToken()
    const id = await generatorId(40)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(10), hoursFromNow(20)) })
    const [{ id: bid }] = await sql(`select id from public.bookings`)
    await rpc('admin_update_booking_status', { p_token: token, p_booking_id: bid, p_status: 'ongoing' })
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(15), hoursFromNow(16)) }), 'SLOT_TAKEN')
    await rpc('admin_update_booking_status', { p_token: token, p_booking_id: bid, p_status: 'completed' })
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(15), hoursFromNow(16)) })
  })
})

describe('price changes and generator status', () => {
  it('keeps saved prices and diesel estimates on existing bookings after the admin edits a generator', async () => {
    await setupPin()
    const token = await adminToken()
    const id = await generatorId(25)
    const before = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(11)) })

    const gens = await rpc<any[]>('admin_list_generators', { p_token: token })
    const g = gens.find((x) => x.id === id)
    await rpc('admin_save_generator', { p_token: token, p_generator: { ...g, hourly_rental_rate: 3200, diesel_consumption_lph: 3.1 } })

    const listed = await rpc<any[]>('list_generators')
    expect(Number(listed.find((x) => x.id === id).hourly_rental_rate)).toBe(3200)

    const after = await rpc<any>('get_booking_receipt', { p_reference: before.booking_reference, p_token: before.receipt_token })
    expect(Number(after.hourly_rate)).toBe(2500)
    expect(Number(after.total_amount)).toBe(20000)
    expect(Number(after.diesel_consumption_lph)).toBe(2.5)
    expect(Number(after.estimated_diesel_litres)).toBe(20)

    const next = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(12), hoursFromNow(20)) })
    expect(Number(next.total_amount)).toBe(25600)
    expect(Number(next.estimated_diesel_litres)).toBe(24.8)
  })

  it('refuses new bookings for inactive or unavailable generators and accepts them again once active', async () => {
    await setupPin()
    const token = await adminToken()
    const id = await generatorId(82)
    await rpc('admin_set_generator_active', { p_token: token, p_generator_id: id, p_active: false })
    expect((await rpc<any[]>('list_generators')).find((g) => g.id === id).availability).toBe('inactive')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(5)) }), 'GENERATOR_INACTIVE')

    await rpc('admin_set_generator_active', { p_token: token, p_generator_id: id, p_active: true })
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(5)) })

    await sql(`update public.generators set under_maintenance = true where id = $1`, [id])
    expect((await rpc<any[]>('list_generators')).find((g) => g.id === id).availability).toBe('unavailable')
    await expectRpcError(rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(6), hoursFromNow(8)) }), 'GENERATOR_UNAVAILABLE')
  })

  it('archives instead of deleting a generator with booking history', async () => {
    await setupPin()
    const token = await adminToken()
    const fresh = await rpc<any>('admin_save_generator', { p_token: token, p_generator: { name: 'Test 15 kVA', capacity_kva: 15, hourly_rental_rate: 1500, diesel_consumption_lph: 1.5 } })
    expect((await rpc<any>('admin_remove_generator', { p_token: token, p_generator_id: fresh.id })).action).toBe('deleted')

    const id = await generatorId(30)
    const r = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(5)) })
    await expectRpcError(rpc('admin_remove_generator', { p_token: token, p_generator_id: id }), 'HAS_UPCOMING_BOOKINGS')
    const [{ id: bid }] = await sql(`select id from public.bookings`)
    await rpc('admin_update_booking_status', { p_token: token, p_booking_id: bid, p_status: 'cancelled' })
    expect((await rpc<any>('admin_remove_generator', { p_token: token, p_generator_id: id })).action).toBe('archived')
    expect((await rpc<any[]>('list_generators')).some((g) => g.id === id)).toBe(false)
    // the receipt still works
    const receipt = await rpc<any>('get_booking_receipt', { p_reference: r.booking_reference, p_token: r.receipt_token })
    expect(Number(receipt.generator.capacity_kva)).toBe(30)
  })
})

describe('receipts', () => {
  it('needs the receipt token, or the reference with the booking mobile number', async () => {
    const id = await generatorId(25)
    const r = await rpc<any>('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(11)) })
    expect(await rpc('get_booking_receipt', { p_reference: r.booking_reference, p_token: 'wrong' })).toBeNull()
    expect((await rpc<any>('get_booking_receipt', { p_reference: r.booking_reference.toLowerCase(), p_token: r.receipt_token })).total_amount).toBeTruthy()
    expect(await rpc('find_booking', { p_reference: r.booking_reference, p_mobile: '9999999999' })).toBeNull()
    expect((await rpc<any>('find_booking', { p_reference: r.booking_reference, p_mobile: '+91 98765 43210' })).booking_reference).toBe(r.booking_reference)
  })
})
