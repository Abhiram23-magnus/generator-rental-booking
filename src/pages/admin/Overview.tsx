import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../lib/api'
import { useAdminQuery } from '../../admin/AdminAuth'
import { PageHeader, StatTile } from '../../admin/ui'
import { ErrorNote, LoadingBlock } from '../../components/Spinner'
import { useSettings } from '../../context/SettingsContext'
import { formatINR, formatNumber } from '../../lib/format'
import { addDaysIso, todayInZone } from '../../lib/time'
import type { DashboardStats } from '../../lib/types'

type Range = 'today' | '7d' | '30d' | 'month' | 'custom'

function RevenueChart({ daily, from, to }: { daily: DashboardStats['daily']; from: string; to: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const days = useMemo(() => {
    const out: { date: string; revenue: number; bookings: number }[] = []
    const map = new Map(daily.map((d) => [d.date, d]))
    for (let d = from; d <= to && out.length < 92; d = addDaysIso(d, 1)) out.push(map.get(d) ?? { date: d, revenue: 0, bookings: 0 })
    return out
  }, [daily, from, to])
  const max = Math.max(1, ...days.map((d) => Number(d.revenue)))
  const W = 720, H = 200, padL = 8, padB = 22
  const bw = (W - padL) / days.length
  const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Daily rental revenue from ${label(from)} to ${label(to)}`} onMouseLeave={() => setHover(null)}>
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="#d5d9dd" />
        {days.map((d, i) => {
          const h = (Number(d.revenue) / max) * (H - padB - 12)
          const x = padL + i * bw
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${label(d.date)}: ${formatINR(d.revenue)}, ${d.bookings} bookings`}>
              <rect x={x} y={0} width={bw} height={H - padB} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x + 1} ${H - padB} v${-Math.max(h - 4, 0)} q0 -4 4 -4 h${Math.max(bw - 10, 0)} q4 0 4 4 v${Math.max(h - 4, 0)} z`}
                  fill={hover === i ? '#a86d00' : '#D88E05'}
                />
              )}
              {(days.length <= 10 || i % Math.ceil(days.length / 8) === 0) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#6b717a">{label(d.date)}</text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-[4px] bg-ink px-3 py-2 text-sm text-white shadow"
          style={{ left: `min(calc(${((padL + hover * bw + bw / 2) / W) * 100}% - 60px), calc(100% - 140px))` }}>
          <p className="font-semibold">{label(days[hover].date)}</p>
          <p className="tabular">{formatINR(days[hover].revenue)}, {days[hover].bookings} booking{days[hover].bookings === 1 ? '' : 's'}</p>
        </div>
      )}
    </div>
  )
}

export default function Overview() {
  const { settings } = useSettings()
  const today = todayInZone(settings.time_zone)
  const [range, setRange] = useState<Range>('month')
  const [custom, setCustom] = useState({ from: addDaysIso(today, -30), to: today })
  const [basis, setBasis] = useState<'booked' | 'completed'>('booked')
  const [showTable, setShowTable] = useState(false)

  const { from, to } = useMemo(() => {
    switch (range) {
      case 'today': return { from: today, to: today }
      case '7d': return { from: addDaysIso(today, -6), to: today }
      case '30d': return { from: addDaysIso(today, -29), to: today }
      case 'month': {
        const [y, m] = today.split('-').map(Number)
        const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
        return { from: `${today.slice(0, 8)}01`, to: addDaysIso(next, -1) }
      }
      default: return custom
    }
  }, [range, custom, today])

  const { data, error, loading, reload } = useAdminQuery((t) => adminApi.stats(t, from, to, basis), [from, to, basis])

  return (
    <div>
      <PageHeader title="Overview" description="Bookings, revenue and fleet status at a glance." />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading figures" />}

      {data && (
        <>
          <section aria-label="Fleet and bookings" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Generators" value={data.total_generators} hint={`${data.active_generators} active and bookable`} />
            <StatTile label="Today's rentals" value={data.todays_bookings} hint="Scheduled at any time today" />
            <StatTile label="Upcoming" value={data.upcoming_bookings} hint="Confirmed, not started" />
            <StatTile label="Ongoing rentals" value={data.ongoing_rentals} />
            <StatTile label="Confirmed" value={data.confirmed_bookings} />
            <StatTile label="Completed" value={data.completed_bookings} />
            <StatTile label="Cancelled" value={data.cancelled_bookings} />
            <Link to="/admin/bookings" className="panel flex items-center justify-center p-4 font-semibold text-amber-ink hover:border-amber">Open bookings</Link>
          </section>

          <section className="panel mt-8 p-5" aria-labelledby="rev-h">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="rev-h" className="text-lg font-bold">Rental revenue</h2>
                <p className="text-sm text-steel">
                  By rental start date. {basis === 'booked' ? 'Counts confirmed, ongoing and completed bookings.' : 'Counts completed bookings only.'} Cancelled bookings are never counted.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="sr-only">Period</span>
                  <select className="input py-2" value={range} onChange={(e) => setRange(e.target.value as Range)}>
                    <option value="today">Today</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="month">This month</option>
                    <option value="custom">Custom dates</option>
                  </select>
                </label>
                {range === 'custom' && (
                  <>
                    <label className="text-sm"><span className="sr-only">From</span><input type="date" className="input py-2" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
                    <label className="text-sm"><span className="sr-only">To</span><input type="date" className="input py-2" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
                  </>
                )}
                <label className="text-sm">
                  <span className="sr-only">Revenue basis</span>
                  <select className="input py-2" value={basis} onChange={(e) => setBasis(e.target.value as 'booked' | 'completed')}>
                    <option value="booked">Booked revenue</option>
                    <option value="completed">Completed only</option>
                  </select>
                </label>
              </div>
            </div>

            <div className={`mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
              <StatTile label="Revenue" value={formatINR(data.revenue)} />
              <StatTile label="Bookings" value={data.period_bookings} />
              <StatTile label="Rental hours" value={formatNumber(data.rental_hours)} hint="Scheduled hours" />
              <StatTile label="Diesel estimate" value={`${formatNumber(data.diesel_litres)} L`} hint="Across these bookings" />
            </div>

            {data.period_bookings > 0 ? (
              <div className="mt-6">
                <RevenueChart daily={data.daily} from={from} to={to} />
                <button type="button" className="mt-2 text-sm font-semibold text-amber-ink underline underline-offset-2" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable}>
                  {showTable ? 'Hide' : 'Show'} the figures as a table
                </button>
                {showTable && (
                  <div className="mt-3 grid gap-6 md:grid-cols-2">
                    <table className="w-full text-sm tabular">
                      <caption className="mb-2 text-left font-semibold">By day</caption>
                      <thead><tr className="border-b border-line text-left text-steel"><th className="py-1.5">Date</th><th>Bookings</th><th className="text-right">Revenue</th></tr></thead>
                      <tbody>{data.daily.map((d) => <tr key={d.date} className="border-b border-line"><td className="py-1.5">{d.date}</td><td>{d.bookings}</td><td className="text-right">{formatINR(d.revenue)}</td></tr>)}</tbody>
                    </table>
                    <table className="w-full text-sm tabular">
                      <caption className="mb-2 text-left font-semibold">By generator</caption>
                      <thead><tr className="border-b border-line text-left text-steel"><th className="py-1.5">Capacity</th><th>Bookings</th><th className="text-right">Revenue</th></tr></thead>
                      <tbody>{data.by_generator.map((g) => <tr key={g.capacity_kva} className="border-b border-line"><td className="py-1.5">{formatNumber(g.capacity_kva)} kVA</td><td>{g.bookings}</td><td className="text-right">{formatINR(g.revenue)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-6 text-steel">No bookings in this period yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
