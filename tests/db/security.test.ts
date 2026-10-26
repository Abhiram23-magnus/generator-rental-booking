import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { RpcError, TEST_PIN, adminToken, bookingPayload, expectRpcError, generatorId, hoursFromNow, pool, resetData, rpc, setupPin, sql } from './helpers'

beforeEach(async () => {
  await resetData()
  await setupPin()
})
afterAll(() => pool.end())

const tables = ['generators', 'customers', 'bookings', 'booking_events', 'business_settings', 'admin_credentials', 'admin_sessions', 'admin_login_attempts']

const adminCalls: [string, Record<string, unknown>][] = [
  ['admin_session', {}],
  ['admin_dashboard_stats', { p_from: '2026-01-01', p_to: '2026-12-31' }],
  ['admin_list_generators', {}],
  ['admin_save_generator', { p_generator: { capacity_kva: 10, hourly_rental_rate: 1, diesel_consumption_lph: 1 } }],
  ['admin_list_bookings', {}],
  ['admin_list_customers', {}],
  ['admin_get_settings', {}],
  ['admin_update_settings', { p_settings: { tax_enabled: true, tax_percent: 50 } }],
  ['admin_calendar', { p_from: new Date().toISOString(), p_to: hoursFromNow(48).toISOString() }],
]

describe('public access', () => {
  it('cannot read or write any table directly', async () => {
    for (const t of tables) {
      await expectRpcError(
        (async () => {
          const client = await pool.connect()
          try {
            await client.query('begin; set local role anon')
            await client.query(`select * from public.${t} limit 1`)
          } catch (e: any) {
            throw new RpcError(e.code, e.message)
          } finally {
            await client.query('rollback')
            client.release()
          }
        })(),
        '42501',
      )
    }
  })

  it('cannot call the PIN setup function or internal helpers', async () => {
    await expectRpcError(rpc('admin_setup_pin', { p_pin: '7777' }), 'permission denied for function admin_setup_pin')
    await expectRpcError(rpc('app_require_admin', { p_token: 'x' }), 'permission denied for function app_require_admin')
    await expectRpcError(rpc('app_receipt_json', { p_booking_id: '00000000-0000-0000-0000-000000000000' }), 'permission denied for function app_receipt_json')
  })

  it('never exposes the PIN or its hash through public settings', async () => {
    const s = await rpc<any>('get_public_settings')
    expect(JSON.stringify(s)).not.toMatch(/pin|\$2[aby]\$/i)
  })
})

describe('admin PIN login', () => {
  it('accepts the correct PIN and rejects a wrong one', async () => {
    const ok = await rpc<any>('admin_login', { p_pin: TEST_PIN })
    expect(ok.ok).toBe(true)
    expect(ok.token).toMatch(/^[0-9a-f]{64}$/)
    const bad = await rpc<any>('admin_login', { p_pin: '0001' })
    expect(bad).toMatchObject({ ok: false, error: 'INVALID_PIN' })
    expect(JSON.stringify(bad)).not.toContain(TEST_PIN)
    expect((await rpc<any>('admin_login', { p_pin: '12a4' })).error).toBe('INVALID_FORMAT')
  })

  it('locks an address after five wrong PINs, even if the sixth is correct', async () => {
    const ip = '192.0.2.50'
    const remaining: number[] = []
    for (let i = 0; i < 5; i++) remaining.push((await rpc<any>('admin_login', { p_pin: '0002' }, { ip })).attempts_remaining)
    expect(remaining).toEqual([4, 3, 2, 1, 0])
    const locked = await rpc<any>('admin_login', { p_pin: TEST_PIN }, { ip })
    expect(locked.error).toBe('LOCKED')
    expect(locked.retry_after_seconds).toBeGreaterThan(800)
    // the lock lifts 15 minutes after the last failure
    await sql(`update public.admin_login_attempts set attempted_at = attempted_at - interval '16 minutes'`)
    expect((await rpc<any>('admin_login', { p_pin: TEST_PIN }, { ip })).ok).toBe(true)
  })

  it('locks every address after ten wrong PINs from anywhere within an hour', async () => {
    for (let i = 0; i < 10; i++) {
      await rpc('admin_login', { p_pin: '0003' }, { ip: `10.0.${i}.1` })
    }
    expect((await rpc<any>('admin_login', { p_pin: TEST_PIN }, { ip: '10.9.9.9' })).error).toBe('LOCKED')
  })

  it('cannot be raced past the limit with parallel guesses', async () => {
    const ip = '192.0.2.77'
    const results = await Promise.all(Array.from({ length: 15 }, () => rpc<any>('admin_login', { p_pin: '0004' }, { ip })))
    expect(results.filter((r) => r.error === 'INVALID_PIN')).toHaveLength(5)
    expect(results.filter((r) => r.error === 'LOCKED')).toHaveLength(10)
  })

  it('reports when no PIN has been set up yet', async () => {
    await sql(`delete from public.admin_credentials`)
    expect((await rpc<any>('admin_login', { p_pin: '4826' })).error).toBe('NOT_CONFIGURED')
  })
})

describe('admin authorization', () => {
  it('denies every admin function without a valid session token', async () => {
    for (const [fn, args] of adminCalls) {
      for (const token of [null, '', 'abc', 'f'.repeat(64)]) {
        await expectRpcError(rpc(fn, { p_token: token, ...args }), 'UNAUTHORIZED')
      }
    }
    expect((await sql(`select tax_percent from public.business_settings`))[0].tax_percent).toBe('0.00')
  })

  it('allows admin functions with a valid token and hides customer data otherwise', async () => {
    const token = await adminToken()
    const id = await generatorId(25)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(11)) })
    const list = await rpc<any>('admin_list_bookings', { p_token: token })
    expect(list.total).toBe(1)
    expect(list.rows[0].customer_mobile).toBe('9876543210')
    const customers = await rpc<any[]>('admin_list_customers', { p_token: token, p_search: '98765' })
    expect(customers).toHaveLength(1)
  })

  it('ends a session after the inactivity timeout and on logout', async () => {
    const token = await adminToken()
    await sql(`update public.admin_sessions set last_seen_at = now() - interval '31 minutes'`)
    await expectRpcError(rpc('admin_session', { p_token: token }), 'UNAUTHORIZED')

    const second = await adminToken()
    await rpc('admin_session', { p_token: second })
    await rpc('admin_logout', { p_token: second })
    await expectRpcError(rpc('admin_session', { p_token: second }), 'UNAUTHORIZED')
  })

  it('signs out old sessions when the PIN changes', async () => {
    const a = await adminToken()
    const b = await adminToken()
    expect((await rpc<any>('admin_change_pin', { p_token: a, p_current_pin: '0000', p_new_pin: '7391' })).error).toBe('INVALID_PIN')
    expect((await rpc<any>('admin_change_pin', { p_token: a, p_current_pin: TEST_PIN, p_new_pin: '1234' })).error).toBe('WEAK_PIN')
    const changed = await rpc<any>('admin_change_pin', { p_token: a, p_current_pin: TEST_PIN, p_new_pin: '7391' })
    expect(changed.ok).toBe(true)

    await expectRpcError(rpc('admin_session', { p_token: a }), 'UNAUTHORIZED')
    await expectRpcError(rpc('admin_session', { p_token: b }), 'UNAUTHORIZED')
    await rpc('admin_session', { p_token: changed.token })
    expect((await rpc<any>('admin_login', { p_pin: TEST_PIN })).error).toBe('INVALID_PIN')
    expect((await rpc<any>('admin_login', { p_pin: '7391' })).ok).toBe(true)
  })

  it('stores the PIN only as a bcrypt hash', async () => {
    const [cred] = await sql(`select pin_hash from public.admin_credentials`)
    expect(cred.pin_hash).toMatch(/^\$2[aby]\$10\$/)
    expect(cred.pin_hash).not.toContain(TEST_PIN)
  })
})

describe('admin booking management', () => {
  it('validates status changes', async () => {
    const token = await adminToken()
    const id = await generatorId(25)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(11)) })
    const [{ id: bid }] = await sql(`select id from public.bookings`)
    await expectRpcError(rpc('admin_update_booking_status', { p_token: token, p_booking_id: bid, p_status: 'flying' }), 'VALIDATION')
    await rpc('admin_update_booking_status', { p_token: token, p_booking_id: bid, p_status: 'completed' })
    await expectRpcError(rpc('admin_update_booking_status', { p_token: token, p_booking_id: bid, p_status: 'confirmed' }), 'INVALID_TRANSITION')
    const detail = await rpc<any>('admin_get_booking', { p_token: token, p_booking_id: bid })
    expect(detail.events.map((e: any) => e.to_status)).toEqual(['confirmed', 'completed'])
  })

  it('reschedules without conflicts using the saved hourly rate', async () => {
    const token = await adminToken()
    const id = await generatorId(25)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(11)) })
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(20), hoursFromNow(24), { mobile_number: '9000000002' }) })
    const [{ id: bid }] = await sql(`select id from public.bookings order by start_at limit 1`)
    await sql(`update public.generators set hourly_rental_rate = 9999 where id = $1`, [id])
    await expectRpcError(rpc('admin_reschedule_booking', { p_token: token, p_booking_id: bid, p_start: hoursFromNow(15).toISOString(), p_end: hoursFromNow(21).toISOString() }), 'SLOT_TAKEN')
    const moved = await rpc<any>('admin_reschedule_booking', { p_token: token, p_booking_id: bid, p_start: hoursFromNow(4).toISOString(), p_end: hoursFromNow(14).toISOString() })
    expect(Number(moved.hourly_rate)).toBe(2500)
    expect(Number(moved.total_amount)).toBe(25000)
    expect(Number(moved.estimated_diesel_litres)).toBe(25)
  })

  it('searches bookings by reference, name, mobile, capacity, status and date', async () => {
    const token = await adminToken()
    const a = await rpc<any>('create_booking', { p_booking: bookingPayload(await generatorId(25), hoursFromNow(3), hoursFromNow(5)) })
    await rpc('create_booking', { p_booking: bookingPayload(await generatorId(82), hoursFromNow(3), hoursFromNow(5), { full_name: 'Meena Iyer', mobile_number: '9123456789' }) })
    const q = async (args: Record<string, unknown>) => (await rpc<any>('admin_list_bookings', { p_token: token, ...args })).total
    expect(await q({ p_search: a.booking_reference })).toBe(1)
    expect(await q({ p_search: 'meena' })).toBe(1)
    expect(await q({ p_search: '91234' })).toBe(1)
    expect(await q({ p_search: '82 kVA' })).toBe(1)
    expect(await q({ p_status: 'confirmed' })).toBe(2)
    expect(await q({ p_status: 'cancelled' })).toBe(0)
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(hoursFromNow(3))
    expect(await q({ p_date: day })).toBe(2)
    expect(await q({ p_date: '2001-01-01' })).toBe(0)
  })

  it('reports revenue without counting cancelled bookings', async () => {
    const token = await adminToken()
    const id = await generatorId(25)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(11)) })
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(12), hoursFromNow(16)) })
    const [{ id: second }] = await sql(`select id from public.bookings order by start_at desc limit 1`)
    await rpc('admin_update_booking_status', { p_token: token, p_booking_id: second, p_status: 'cancelled' })

    const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(hoursFromNow(48))
    const stats = await rpc<any>('admin_dashboard_stats', { p_token: token, p_from: from, p_to: to })
    expect(Number(stats.revenue)).toBe(20000)
    expect(Number(stats.rental_hours)).toBe(8)
    expect(Number(stats.diesel_litres)).toBe(20)
    expect(stats.cancelled_bookings).toBe(1)
    expect(stats.total_generators).toBe(7)
    const completedOnly = await rpc<any>('admin_dashboard_stats', { p_token: token, p_from: from, p_to: to, p_revenue_basis: 'completed' })
    expect(Number(completedOnly.revenue)).toBe(0)
  })

  it('corrects customer details and rejects a duplicate mobile number', async () => {
    const token = await adminToken()
    const id = await generatorId(25)
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(3), hoursFromNow(5)) })
    await rpc('create_booking', { p_booking: bookingPayload(id, hoursFromNow(6), hoursFromNow(8), { mobile_number: '9123456789', full_name: 'Meena' }) })
    const [c] = await sql(`select id from public.customers where mobile_number = '9876543210'`)
    const updated = await rpc<any>('admin_update_customer', { p_token: token, p_customer_id: c.id, p_customer: { full_name: 'Ravi K. Sharma', mobile_number: '9876543210', email: '' } })
    expect(updated.full_name).toBe('Ravi K. Sharma')
    expect(updated.email).toBeNull()
    await expectRpcError(rpc('admin_update_customer', { p_token: token, p_customer_id: c.id, p_customer: { full_name: 'Ravi', mobile_number: '9123456789' } }), 'DUPLICATE_MOBILE')
  })

  it('saves settings and rejects out-of-range values', async () => {
    const token = await adminToken()
    const s = await rpc<any>('admin_update_settings', { p_token: token, p_settings: { business_name: 'Sri Power Rentals', contact_phone: '+91 90000 11111', tax_enabled: true, tax_percent: 18 } })
    expect(s.business_name).toBe('Sri Power Rentals')
    expect((await rpc<any>('get_public_settings')).pricing.tax_percent).toBe(18)
    await expectRpcError(rpc('admin_update_settings', { p_token: token, p_settings: { tax_percent: 180 } }), 'VALIDATION')
    await expectRpcError(rpc('admin_update_settings', { p_token: token, p_settings: { time_zone: 'Mars/Base' } }), 'VALIDATION')
  })
})
