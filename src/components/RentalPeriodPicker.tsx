import { CalendarDays, Clock3 } from 'lucide-react'
import type { Period } from '../context/BookingDraftContext'
import { formatDuration } from '../lib/pricing'
import { dateToZonedParts, todayInZone, zonedToDate } from '../lib/time'
import { periodErrorMessage, validatePeriod } from '../lib/validation'
import { useSettings } from '../context/SettingsContext'

const QUICK = [4, 8, 12, 24]

export function periodToDates(p: Period, tz: string) {
  return { start: zonedToDate(p.startDate, p.startTime, tz), end: zonedToDate(p.endDate, p.endTime, tz) }
}

export function usePeriodState(p: Period) {
  const { settings } = useSettings()
  const { start, end } = periodToDates(p, settings.time_zone)
  const error = validatePeriod(start, end, { minLeadMinutes: settings.min_lead_minutes, maxDays: settings.max_booking_days })
  return {
    start, end, error,
    message: periodErrorMessage(error, { minLeadMinutes: settings.min_lead_minutes, maxDays: settings.max_booking_days }),
    seconds: start && end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0,
  }
}

export function RentalPeriodPicker({ value, onChange, compact = false, idPrefix = 'period' }: { value: Period; onChange: (p: Period) => void; compact?: boolean; idPrefix?: string }) {
  const { settings } = useSettings()
  const tz = settings.time_zone
  const { start, error, message, seconds } = usePeriodState(value)
  const today = todayInZone(tz)

  const setDuration = (hours: number) => {
    if (!start) return
    const e = dateToZonedParts(new Date(start.getTime() + hours * 3600_000), tz)
    onChange({ ...value, endDate: e.date, endTime: e.time })
  }

  const field = (key: keyof Period, label: string, type: 'date' | 'time') => (
    <div>
      <label htmlFor={`${idPrefix}-${key}`} className="field-label">{label}</label>
      <div className="relative">
        <input
          id={`${idPrefix}-${key}`}
          type={type}
          className="input pl-10"
          value={value[key]}
          min={type === 'date' ? today : undefined}
          step={type === 'time' ? 900 : undefined}
          aria-invalid={key.startsWith('start') ? error === 'past' : error === 'reversed' || error === 'too_long'}
          aria-describedby={`${idPrefix}-summary`}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          required
        />
        {type === 'date'
          ? <CalendarDays size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel" aria-hidden />
          : <Clock3 size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel" aria-hidden />}
      </div>
    </div>
  )

  return (
    <fieldset>
      <legend className="sr-only">Rental period</legend>
      <div className={`grid gap-4 ${compact ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'}`}>
        {field('startDate', 'Start date', 'date')}
        {field('startTime', 'Start time', 'time')}
        {field('endDate', 'End date', 'date')}
        {field('endTime', 'End time', 'time')}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-steel">Quick length:</span>
        {QUICK.map((h) => (
          <button key={h} type="button" onClick={() => setDuration(h)} disabled={!start}
            className="rounded-full border border-line bg-paper px-3 py-1 text-sm font-medium hover:border-ink disabled:opacity-50">
            {h} hours
          </button>
        ))}
      </div>
      <p id={`${idPrefix}-summary`} className={`mt-3 text-[15px] ${error ? 'font-medium text-busy' : 'text-ink'}`} aria-live="polite">
        {error ? message : <>Rental duration: <strong>{formatDuration(seconds)}</strong> <span className="text-steel">(times are {tz === 'Asia/Kolkata' ? 'Indian Standard Time' : tz})</span></>}
      </p>
    </fieldset>
  )
}
