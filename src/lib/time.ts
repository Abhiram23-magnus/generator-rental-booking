import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

export const DEFAULT_TZ = 'Asia/Kolkata'

/** Combine a yyyy-mm-dd date and HH:mm time entered in the business time zone into an instant. */
export function zonedToDate(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const d = fromZonedTime(`${date}T${time}:00`, timeZone)
  return Number.isNaN(d.getTime()) ? null : d
}

export function dateToZonedParts(d: Date, timeZone: string) {
  return { date: formatInTimeZone(d, timeZone, 'yyyy-MM-dd'), time: formatInTimeZone(d, timeZone, 'HH:mm') }
}

export function todayInZone(timeZone: string): string {
  return formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd')
}

/** Next full hour from now (in the business time zone), and eight hours after it. */
export function defaultRentalPeriod(timeZone: string, now = new Date()) {
  const minutes = Number(formatInTimeZone(now, timeZone, 'm'))
  const start = new Date(now)
  start.setSeconds(0, 0)
  start.setTime(start.getTime() + (60 - minutes) * 60_000)
  const end = new Date(start.getTime() + 8 * 3600_000)
  return { start: dateToZonedParts(start, timeZone), end: dateToZonedParts(end, timeZone) }
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
