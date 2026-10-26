import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { adminApi } from '../../lib/api'
import { useAdmin, useAdminQuery } from '../../admin/AdminAuth'
import { BookingDrawer } from '../../admin/BookingDrawer'
import { Drawer, PageHeader, Toast } from '../../admin/ui'
import { StatusBadge } from '../../components/StatusBadge'
import { ErrorNote, LoadingBlock } from '../../components/Spinner'
import { useSettings } from '../../context/SettingsContext'
import { formatDateTime, formatINR, formatMobile, formatNumber } from '../../lib/format'
import type { AdminCustomerDetail } from '../../lib/types'
import { normalizeMobile } from '../../lib/validation'

function CustomerPanel({ id, onOpenBooking, onSaved }: { id: string; onOpenBooking: (id: string) => void; onSaved: () => void }) {
  const { token } = useAdmin()
  const { settings } = useSettings()
  const [c, setC] = useState<AdminCustomerDetail | null>(null)
  const [form, setForm] = useState({ full_name: '', mobile_number: '', email: '' })
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminApi.customer(token, id).then((d) => { setC(d); setForm({ full_name: d.full_name, mobile_number: d.mobile_number, email: d.email ?? '' }) }, (e: Error) => setError(e.message))
  }, [id, token])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.full_name.trim().length < 2) return setError('Enter the customer\'s full name.')
    if (!normalizeMobile(form.mobile_number)) return setError('Enter a valid 10-digit Indian mobile number.')
    setSaving(true); setError(null)
    try {
      const d = await adminApi.updateCustomer(token, id, form)
      setC(d); setEditing(false); onSaved()
    } catch (err) { setError((err as Error).message) } finally { setSaving(false) }
  }

  if (!c) return error ? <ErrorNote message={error} /> : <LoadingBlock label="Loading customer" />
  return (
    <div className="space-y-6">
      {editing ? (
        <form onSubmit={save} className="space-y-4" noValidate>
          {(['full_name', 'mobile_number', 'email'] as const).map((k) => (
            <div key={k}>
              <label htmlFor={`c-${k}`} className="field-label">{k === 'full_name' ? 'Full name' : k === 'mobile_number' ? 'Mobile number' : 'Email (optional)'}</label>
              <input id={`c-${k}`} className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} type={k === 'email' ? 'email' : k === 'mobile_number' ? 'tel' : 'text'} />
            </div>
          ))}
          <p className="text-sm text-steel">Corrections apply to this customer's receipts, including past ones.</p>
          {error && <ErrorNote message={error} />}
          <div className="flex gap-3">
            <button type="submit" className="btn-amber" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div>
          <p className="text-xl font-bold">{c.full_name}</p>
          <p><a className="underline-offset-2 hover:underline" href={`tel:+91${c.mobile_number}`}>{formatMobile(c.mobile_number)}</a></p>
          {c.email && <p className="text-steel">{c.email}</p>}
          <p className="mt-1 text-sm text-steel">Customer since {formatDateTime(c.created_at, settings.time_zone)}</p>
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => setEditing(true)}>Correct details</button>
        </div>
      )}
      <section>
        <h3 className="mb-2 font-bold">Booking history ({c.bookings.length})</h3>
        <ul className="space-y-2">
          {c.bookings.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onOpenBooking(b.id)} className="panel block w-full p-3 text-left hover:border-steel">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{b.booking_reference}</span>
                  <StatusBadge value={b.status} size="sm" />
                </div>
                <p className="text-sm">{formatNumber(b.generator_capacity)} kVA, {formatDateTime(b.start_at, settings.time_zone)}</p>
                <p className="text-sm font-semibold tabular">{formatINR(b.total_amount)}</p>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default function Customers() {
  const { settings } = useSettings()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const openId = params.get('open')
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t) }, [search])
  const { data, error, loading, reload } = useAdminQuery((t) => adminApi.customers(t, q), [q])

  const open = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('open', id); else p.delete('open')
    setParams(p, { replace: true })
  }

  return (
    <div>
      <PageHeader title="Customers" description="Everyone who has booked, with their booking history." />
      <label className="relative mb-4 block max-w-md">
        <span className="sr-only">Search customers</span>
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel" aria-hidden />
        <input className="input py-2.5 pl-10" placeholder="Name or mobile number" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading customers" />}
      {data && data.length === 0 && <div className="panel p-10 text-center text-steel">{q ? 'No customers match that search.' : 'Customers appear here after their first booking.'}</div>}
      {data && data.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <thead className="border-b border-line bg-concrete/60 text-sm text-steel">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Mobile</th>
                <th scope="col" className="px-4 py-3 font-semibold">Bookings</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Booked value</th>
                <th scope="col" className="px-4 py-3 font-semibold">Latest rental</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-amber-soft/30" onClick={() => open(c.id)}>
                  <td className="px-4 py-3"><button type="button" className="font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); open(c.id) }}>{c.full_name}</button>{c.email && <span className="block text-sm text-steel">{c.email}</span>}</td>
                  <td className="px-4 py-3 tabular">{formatMobile(c.mobile_number)}</td>
                  <td className="px-4 py-3">{c.bookings}</td>
                  <td className="px-4 py-3 text-right tabular">{formatINR(c.total_booked)}</td>
                  <td className="px-4 py-3 text-sm">{c.last_booking_at ? formatDateTime(c.last_booking_at, settings.time_zone) : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={!!openId} onClose={() => open(null)} title="Customer">
        {openId && <CustomerPanel key={openId} id={openId} onOpenBooking={setBookingId} onSaved={() => { setToast('Customer details saved.'); reload() }} />}
      </Drawer>
      <BookingDrawer bookingId={bookingId} onClose={() => setBookingId(null)} onChanged={reload} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
