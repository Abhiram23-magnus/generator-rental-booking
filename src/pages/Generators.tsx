import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { GeneratorCard } from '../components/GeneratorCard'
import { RentalPeriodPicker, usePeriodState } from '../components/RentalPeriodPicker'
import { ErrorNote } from '../components/Spinner'
import { useBookingDraft } from '../context/BookingDraftContext'
import { useSettings } from '../context/SettingsContext'
import { api } from '../lib/api'
import type { GeneratorListing } from '../lib/types'

export default function Generators() {
  const { settings } = useSettings()
  const { period, setPeriod, selectGenerator } = useBookingDraft()
  const { start, end, error: periodError } = usePeriodState(period)
  const [list, setList] = useState<GeneratorListing[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const requestId = useRef(0)

  const startMs = start?.getTime() ?? null
  const endMs = end?.getTime() ?? null
  const valid = !periodError

  const load = () => {
    const id = ++requestId.current
    setLoading(true)
    api
      .listGenerators(valid && startMs ? new Date(startMs) : null, valid && endMs ? new Date(endMs) : null)
      .then((rows) => { if (id === requestId.current) { setList(rows); setError(null) } })
      .catch((e: Error) => { if (id === requestId.current) setError(e.message) })
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, valid])

  // refresh when the customer returns to the tab
  useEffect(() => {
    const onFocus = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, valid])

  const choose = (g: GeneratorListing) => {
    selectGenerator(g.id)
    navigate('/book')
  }

  return (
    <div>
      <section className="bg-ink pb-24 text-white">
        <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
          <h1 className="font-wide text-3xl font-extrabold sm:text-4xl">Choose your generator</h1>
          <p className="mt-2 max-w-2xl text-white/70">Enter when you need power. Availability and prices update for exactly that period.</p>
        </div>
      </section>

      <div className="mx-auto -mt-16 max-w-6xl px-4 sm:px-6">
        <div className="panel p-5 shadow-[0_18px_40px_-20px_rgba(31,34,38,.45)] sm:p-6">
          <RentalPeriodPicker value={period} onChange={setPeriod} compact idPrefix="browse" />
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="text-steel" aria-live="polite">
            {loading ? 'Checking availability…' : list ? `${list.filter((g) => g.availability === 'available').length} of ${list.length} generators free for this period` : ''}
          </p>
          <button type="button" onClick={load} className="btn-ghost btn-sm" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden /> Refresh
          </button>
        </div>

        {error && <div className="mt-4"><ErrorNote message={error} onRetry={load} /></div>}

        <div className="mt-5 grid gap-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {list === null && !error &&
            Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[440px] animate-pulse rounded-[6px] bg-paper" />)}
          {list?.map((g) => (
            <GeneratorCard
              key={g.id}
              g={g}
              loading={loading}
              period={valid && start && end ? { start, end } : null}
              pricing={settings.pricing}
              timeZone={settings.time_zone}
              onSelect={() => choose(g)}
            />
          ))}
          {list?.length === 0 && <p className="text-steel">No generators are listed right now. Please call us to arrange one.</p>}
        </div>
      </div>
    </div>
  )
}
