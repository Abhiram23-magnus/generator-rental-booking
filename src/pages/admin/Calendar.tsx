import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { adminApi } from '../../lib/api'
import { useAdminQuery } from '../../admin/AdminAuth'
import { BookingDrawer } from '../../admin/BookingDrawer'
import { PageHeader } from '../../admin/ui'
import { STATUS_BAR, STATUS_LABEL } from '../../components/StatusBadge'
import { ErrorNote } from '../../components/Spinner'
import { useSettings } from '../../context/SettingsContext'
import { formatNumber, formatTime } from '../../lib/format'
import { addDaysIso, todayInZone, zonedToDate, dateToZonedParts } from '../../lib/time'
import type { AdminBookingRow } from '../../lib/types'

type View = 'day' | 'week' | 'month'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const weekday = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0
const startOfWeek = (d: string) => addDaysIso(d, -weekday(d))
const monthLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' })

function Entry({ b, tz, onOpen, compact = false }: { b: AdminBookingRow; tz: string; onOpen: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onOpen}
      className={`block w-full rounded-[3px] px-2 py-1 text-left text-xs leading-snug hover:brightness-95 ${STATUS_BAR[b.status]}`}
      aria-label={`${b.booking_reference}, ${formatNumber(b.generator_capacity)} kVA, ${formatTime(b.start_at, tz)} to ${formatTime(b.end_at, tz)}, ${STATUS_LABEL[b.status]}`}>
      <span className="font-bold">{formatNumber(b.generator_capacity)} kVA</span>{' '}
      {!compact && <span>{formatTime(b.start_at, tz)} to {formatTime(b.end_at, tz)}</span>}
      <span className="block opacity-80">{b.booking_reference}{compact ? '' : `, ${STATUS_LABEL[b.status]}`}</span>
    </button>
  )
}

export default function Calendar() {
  const { settings } = useSettings()
  const tz = settings.time_zone
  const today = todayInZone(tz)
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(today)
  const [params] = useSearchParams()
  const [generatorId, setGeneratorId] = useState(params.get('generator') ?? '')
  const [showCancelled, setShowCancelled] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const range = useMemo(() => {
    if (view === 'day') return { from: anchor, days: 1 }
    if (view === 'week') return { from: startOfWeek(anchor), days: 7 }
    const first = `${anchor.slice(0, 8)}01`
    return { from: startOfWeek(first), days: 42 }
  }, [view, anchor])

  const days = useMemo(() => Array.from({ length: range.days }, (_, i) => addDaysIso(range.from, i)), [range])
  const fromInstant = zonedToDate(days[0], '00:00', tz)!
  const toInstant = zonedToDate(addDaysIso(days[days.length - 1], 1), '00:00', tz)!

  const gens = useAdminQuery((t) => adminApi.generators(t), [])
  const { data, error, loading, reload } = useAdminQuery(
    (t) => adminApi.calendar(t, fromInstant, toInstant, generatorId || undefined),
    [fromInstant.getTime(), toInstant.getTime(), generatorId],
  )

  const visible = (data ?? []).filter((b) => showCancelled || b.status !== 'cancelled')
  const onDay = (d: string) => {
    const s = zonedToDate(d, '00:00', tz)!.getTime(), e = s + 86_400_000
    return visible.filter((b) => new Date(b.start_at).getTime() < e && new Date(b.end_at).getTime() > s)
  }

  const step = (dir: number) => {
    if (view === 'day') setAnchor(addDaysIso(anchor, dir))
    else if (view === 'week') setAnchor(addDaysIso(anchor, dir * 7))
    else {
      const [y, m] = anchor.split('-').map(Number)
      const d = new Date(Date.UTC(y, m - 1 + dir, 1))
      setAnchor(d.toISOString().slice(0, 10))
    }
  }

  const title = view === 'day' ? dayLabel(anchor) : view === 'week'
    ? `${dayLabel(days[0], { day: 'numeric', month: 'short' })} to ${dayLabel(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`
    : monthLabel(anchor)

  const activeGens = (gens.data ?? []).filter((g) => !g.is_archived && (!generatorId || g.id === generatorId))

  return (
    <div>
      <PageHeader title="Rental calendar" description="Scheduled rentals by day, week or month. Select a rental to open the booking." />

      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-[4px] border border-line" role="group" aria-label="Calendar view">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={`px-3 py-2 text-sm font-semibold capitalize ${view === v ? 'bg-ink text-white' : 'text-iron hover:bg-concrete'}`}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost btn-sm" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAnchor(today)}>Today</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => step(1)} aria-label="Next"><ChevronRight size={18} /></button>
        </div>
        <h2 className="text-lg font-bold" aria-live="polite">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <select className="input w-auto py-2 text-sm" value={generatorId} onChange={(e) => setGeneratorId(e.target.value)} aria-label="Generator">
            <option value="">All generators</option>
            {gens.data?.filter((g) => !g.is_archived).map((g) => <option key={g.id} value={g.id}>{formatNumber(g.capacity_kva)} kVA{g.name ? ` (${g.name})` : ''}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="h-4 w-4 accent-amber" />
            Show cancelled
          </label>
        </div>
      </div>

      <ul className="mb-4 flex flex-wrap gap-3 text-xs" aria-label="Status key">
        {(['confirmed', 'ongoing', 'completed', 'cancelled'] as const).map((s) => (
          <li key={s} className={`rounded-[3px] px-2 py-1 ${STATUS_BAR[s]}`}>{STATUS_LABEL[s]}</li>
        ))}
      </ul>

      {error && <ErrorNote message={error} onRetry={reload} />}

      <div className={loading ? 'opacity-60 transition-opacity' : ''}>
        {view === 'month' && (
          <div className="panel overflow-x-auto">
            <div className="grid min-w-[700px] grid-cols-7">
              {WEEKDAYS.map((w) => <div key={w} className="border-b border-line px-2 py-2 text-xs font-semibold text-steel">{w}</div>)}
              {days.map((d) => {
                const items = onDay(d)
                const inMonth = d.slice(0, 7) === anchor.slice(0, 7)
                return (
                  <div key={d} className={`min-h-28 border-b border-r border-line p-1.5 ${inMonth ? '' : 'bg-concrete/50'}`}>
                    <button type="button" onClick={() => { setAnchor(d); setView('day') }}
                      className={`mb-1 rounded px-1.5 text-sm font-semibold ${d === today ? 'bg-amber text-ink' : inMonth ? 'text-ink' : 'text-steel'}`}
                      aria-label={`Open ${dayLabel(d)}`}>
                      {Number(d.slice(8))}
                    </button>
                    <div className="space-y-1">
                      {items.slice(0, 3).map((b) => <Entry key={b.id} b={b} tz={tz} compact onOpen={() => setOpenId(b.id)} />)}
                      {items.length > 3 && (
                        <button type="button" className="text-xs font-semibold text-amber-ink" onClick={() => { setAnchor(d); setView('day') }}>
                          {items.length - 3} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'week' && (
          <div className="grid gap-3 md:grid-cols-7">
            {days.map((d) => {
              const items = onDay(d)
              return (
                <section key={d} className={`panel min-h-40 p-2 ${d === today ? 'ring-2 ring-amber' : ''}`} aria-label={dayLabel(d)}>
                  <button type="button" onClick={() => { setAnchor(d); setView('day') }} className="mb-2 w-full text-left">
                    <span className="text-xs text-steel">{WEEKDAYS[weekday(d)]}</span>
                    <span className="ml-1 font-bold">{dayLabel(d, { day: 'numeric', month: 'short' })}</span>
                  </button>
                  <div className="space-y-1.5">
                    {items.length === 0 && <p className="text-xs text-steel">No rentals</p>}
                    {items.map((b) => <Entry key={b.id} b={b} tz={tz} onOpen={() => setOpenId(b.id)} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {view === 'day' && (() => {
          const dayStart = zonedToDate(anchor, '00:00', tz)!.getTime()
          const items = onDay(anchor)
          const pct = (t: number) => Math.min(100, Math.max(0, ((t - dayStart) / 86_400_000) * 100))
          return (
            <div className="space-y-6">
              <div className="panel overflow-x-auto p-4">
                <div className="min-w-[720px]">
                  <div className="ml-28 flex justify-between text-[11px] text-steel">
                    {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h}>{h === 24 ? '' : `${String(h).padStart(2, '0')}:00`}</span>)}
                  </div>
                  <div className="mt-1 space-y-2">
                    {activeGens.map((g) => (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="w-26 shrink-0 text-sm font-bold">{formatNumber(g.capacity_kva)} kVA</div>
                        <div className="relative h-11 flex-1 rounded-[3px] bg-concrete">
                          {items.filter((b) => b.generator_id === g.id).map((b) => {
                            const left = pct(new Date(b.start_at).getTime()), right = pct(new Date(b.end_at).getTime())
                            return (
                              <button key={b.id} type="button" onClick={() => setOpenId(b.id)}
                                style={{ left: `${left}%`, width: `${Math.max(right - left, 2)}%` }}
                                className={`absolute inset-y-1 overflow-hidden rounded-[3px] px-1.5 text-left text-[11px] leading-tight ${STATUS_BAR[b.status]}`}
                                title={`${b.booking_reference}: ${formatTime(b.start_at, tz)} to ${formatTime(b.end_at, tz)}, ${STATUS_LABEL[b.status]}`}>
                                <span className="font-bold">{b.booking_reference}</span>
                                <span className="block">{STATUS_LABEL[b.status]}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <section>
                <h3 className="mb-2 font-bold">Rentals on this day</h3>
                {items.length === 0 ? <p className="text-steel">No rentals scheduled.</p> : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((b) => (
                      <li key={b.id}><Entry b={b} tz={tz} onOpen={() => setOpenId(b.id)} />
                        <p className="px-2 pt-1 text-xs text-steel">{b.customer_name}, {dateToZonedParts(new Date(b.start_at), tz).date !== anchor ? 'started earlier' : 'starts today'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )
        })()}
      </div>

      <BookingDrawer bookingId={openId} onClose={() => setOpenId(null)} onChanged={reload} />
    </div>
  )
}
