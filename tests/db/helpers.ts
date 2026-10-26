import pg from 'pg'

// Runs every call the way Supabase's API does: inside a transaction, as the
// anon role, with the request headers exposed through request.headers.
export const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/generator_test'

export const pool = new pg.Pool({ connectionString: DB_URL, max: 20 })

export class RpcError extends Error {
  code: string
  detail: string | undefined
  constructor(code: string, detail: string | undefined) {
    super(`${code}${detail ? `: ${detail}` : ''}`)
    this.code = code
    this.detail = detail
  }
}

export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}, opts: { ip?: string; role?: string } = {}): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`set local role ${opts.role ?? 'anon'}`)
    await client.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': opts.ip ?? '203.0.113.10' })])
    const names = Object.keys(args)
    const params = names.map((n) => {
      const v = args[n]
      return v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) ? JSON.stringify(v) : v
    })
    const call = names.map((n, i) => `${n} => $${i + 1}`).join(', ')
    const res = await client.query(`select public.${fn}(${call}) as result`, params)
    await client.query('commit')
    return res.rows[0].result as T
  } catch (e: any) {
    await client.query('rollback').catch(() => {})
    throw new RpcError(e.message, e.detail)
  } finally {
    client.release()
  }
}

/** Runs SQL as the database owner (tests only). */
export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params)
  return res.rows as T[]
}

export async function resetData() {
  await sql(`truncate public.booking_events, public.bookings, public.customers, public.admin_sessions, public.admin_login_attempts restart identity cascade`)
  await sql(`update public.business_settings set billing_mode = 'exact', minimum_billable_hours = 0,
    delivery_charge_enabled = false, delivery_charge = 0, discount_enabled = false, discount_percent = 0,
    tax_enabled = false, tax_percent = 0, min_lead_minutes = 0, max_booking_days = 60,
    admin_session_timeout_minutes = 30, time_zone = 'Asia/Kolkata'`)
  await sql(`delete from public.generators where capacity_kva not in (25,30,40,50,62,82,125) or name like 'Test %'`)
  await sql(`update public.generators g set hourly_rental_rate = v.rate, diesel_consumption_lph = v.lph,
      is_active = true, under_maintenance = false, is_archived = false
    from (values (25,2500,2.5),(30,3000,3),(40,4000,4),(50,5000,5),(62,6000,6),(82,8000,8),(125,10000,10)) v(kva, rate, lph)
    where g.capacity_kva = v.kva`)
}

export async function generatorId(kva: number): Promise<string> {
  const rows = await sql<{ id: string }>(`select id from public.generators where capacity_kva = $1 order by created_at limit 1`, [kva])
  return rows[0].id
}

/** A whole-minute instant `hours` from now. */
export function hoursFromNow(hours: number): Date {
  const d = new Date(Date.now() + hours * 3600_000)
  d.setSeconds(0, 0)
  return d
}

export function bookingPayload(generator_id: string, start: Date, end: Date, overrides: Record<string, unknown> = {}) {
  return {
    generator_id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    full_name: 'Ravi Kumar',
    mobile_number: '+91 98765 43210',
    email: 'ravi@example.com',
    rental_location: '12 MG Road, Bengaluru 560001',
    landmark: 'Opposite the metro station',
    notes: 'Need it ready by 7 am',
    ...overrides,
  }
}

export const TEST_PIN = '4826'

export async function setupPin(pin = TEST_PIN) {
  await sql(`select public.admin_setup_pin($1)`, [pin])
}

export async function adminToken(pin = TEST_PIN, ip = '198.51.100.7'): Promise<string> {
  const res = await rpc<{ ok: boolean; token: string }>('admin_login', { p_pin: pin }, { ip })
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(res)}`)
  return res.token
}

export async function expectRpcError(p: Promise<unknown>, code: string) {
  try {
    await p
  } catch (e) {
    if (e instanceof RpcError) {
      if (e.code !== code) throw new Error(`expected ${code}, got ${e.code} (${e.detail})`)
      return e
    }
    throw e
  }
  throw new Error(`expected ${code}, but the call succeeded`)
}
