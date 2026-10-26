import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { adminApi } from '../../lib/api'
import { useAdminQuery } from '../../admin/AdminAuth'
import { BookingDrawer } from '../../admin/BookingDrawer'
import { PageHeader } from '../../admin/ui'
import { StatusBadge } from '../../components/StatusBadge'
import { ErrorNote, LoadingBlock } from '../../components/Spinner'
import { useSettings } from '../../context/SettingsContext'
import { formatDateTime, formatINR, formatMobile, formatNumber } from '../../lib/format'

const PAGE = 25

export default function Bookings() {
  const { settings } = useSettings()
  const tz = settings.time_zone
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(search)
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [generatorId, setGeneratorId] = useState('')
  const [date, setDate] = useState('')
  const [page, setPage] = useState(0)
  const openId = params.get('open')

  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(0) }, 300); return () => clearTimeout(t) }, [search])

  const gens = useAdminQuery((t) => adminApi.generators(t), [])
  const { data, error, loading, reload } = useAdminQuery(
    (t) => adminApi.bookings(t, { search: debounced, status, generatorId, date, limit: PAGE, offset: page * PAGE }),
    [debounced, status, generatorId, date, page],
  )

  const open = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('open', id); else p.delete('open')
    setParams(p, { replace: true })
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1

  return (
    <div>
      <PageHeader title="Bookings" description="Search, review and update customer bookings." />

      <div className="panel mb-4 grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <label className="relative block">
          <span className="sr-only">Search bookings</span>
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel" aria-hidden />
          <input className="input py-2.5 pl-10" placeholder="Reference, name, mobile or kVA" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select className="input py-2.5" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}>
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Generator</span>
          <select className="input py-2.5" value={generatorId} onChange={(e) => { setGeneratorId(e.target.value); setPage(0) }}>
            <option value="">All generators</option>
            {gens.data?.map((g) => <option key={g.id} value={g.id}>{formatNumber(g.capacity_kva)} kVA{g.name ? ` (${g.name})` : ''}{g.is_archived ? ' (archived)' : ''}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Rental date</span>
          <input type="date" className="input py-2.5" value={date} onChange={(e) => { setDate(e.target.value); setPage(0) }} aria-label="Rental date" />
        </label>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading bookings" />}

      {data && (
        <div className={loading ? 'opacity-60' : ''}>
          <p className="mb-2 text-sm text-steel" aria-live="polite">{data.total} booking{data.total === 1 ? '' : 's'}</p>
          {data.rows.length === 0 ? (
            <div className="panel p-10 text-center text-steel">No bookings match these filters. Clear the search or choose another status.</div>
          ) : (
            <>
              <div className="panel hidden overflow-x-auto md:block">
                <table className="w-full text-left text-[15px]">
                  <thead className="border-b border-line bg-concrete/60 text-sm text-steel">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Generator</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Rental period</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-amber-soft/30" onClick={() => open(r.id)}>
                        <td className="px-4 py-3">
                          <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); open(r.id) }}>{r.booking_reference}</button>
                        </td>
                        <td className="px-4 py-3">{r.customer_name}<span className="block text-sm text-steel">{formatMobile(r.customer_mobile)}</span></td>
                        <td className="px-4 py-3 font-semibold">{formatNumber(r.generator_capacity)} kVA</td>
                        <td className="px-4 py-3 text-sm">{formatDateTime(r.start_at, tz)}<span className="block text-steel">to {formatDateTime(r.end_at, tz)}</span></td>
                        <td className="px-4 py-3 text-right tabular">{formatINR(r.total_amount)}<span className="block text-sm text-steel">{formatNumber(r.estimated_diesel_litres)} L diesel</span></td>
                        <td className="px-4 py-3"><StatusBadge value={r.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-3 md:hidden">
                {data.rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => open(r.id)} className="panel block w-full p-4 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{r.booking_reference}</span>
                        <StatusBadge value={r.status} size="sm" />
                      </div>
                      <p className="mt-1">{r.customer_name}, {formatNumber(r.generator_capacity)} kVA</p>
                      <p className="text-sm text-steel">{formatDateTime(r.start_at, tz)} to {formatDateTime(r.end_at, tz)}</p>
                      <p className="mt-1 font-semibold tabular">{formatINR(r.total_amount)}</p>
                    </button>
                  </li>
                ))}
              </ul>

              {pages > 1 && (
                <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Pages">
                  <button type="button" className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <span className="text-sm text-steel">Page {page + 1} of {pages}</span>
                  <button type="button" className="btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
                </nav>
              )}
            </>
          )}
        </div>
      )}

      <BookingDrawer bookingId={openId} onClose={() => open(null)} onChanged={reload} />
    </div>
  )
}
