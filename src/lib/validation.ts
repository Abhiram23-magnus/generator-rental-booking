import { z } from 'zod'

/** Mirrors public.app_normalize_mobile: returns the 10-digit number or null. */
export function normalizeMobile(input: string): string | null {
  let v = (input || '').replace(/[\s\-().]/g, '')
  if (v.startsWith('+91')) v = v.slice(3)
  else if (v.length === 12 && v.startsWith('91')) v = v.slice(2)
  else if (v.length === 11 && v.startsWith('0')) v = v.slice(1)
  return /^[6-9]\d{9}$/.test(v) ? v : null
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/
const timeRe = /^\d{2}:\d{2}$/

export const bookingFormSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(100, 'Keep the name under 100 characters.'),
  mobile_number: z.string().trim().refine((v) => normalizeMobile(v) !== null, 'Enter a 10-digit Indian mobile number, with or without +91.'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address or leave it empty.')]).optional(),
  rental_location: z.string().trim().min(5, 'Enter the complete delivery address.').max(500, 'Keep the address under 500 characters.'),
  landmark: z.string().trim().max(300, 'Keep this under 300 characters.').optional(),
  notes: z.string().trim().max(1000, 'Keep notes under 1000 characters.').optional(),
  start_date: z.string().regex(dateRe, 'Choose a start date.'),
  start_time: z.string().regex(timeRe, 'Choose a start time.'),
  end_date: z.string().regex(dateRe, 'Choose an end date.'),
  end_time: z.string().regex(timeRe, 'Choose an end time.'),
})

export type BookingFormValues = z.infer<typeof bookingFormSchema>

export type PeriodError = 'missing' | 'reversed' | 'past' | 'too_long' | null

export function validatePeriod(start: Date | null, end: Date | null, opts: { now?: Date; minLeadMinutes?: number; maxDays?: number } = {}): PeriodError {
  if (!start || !end) return 'missing'
  if (end.getTime() <= start.getTime()) return 'reversed'
  const now = opts.now ?? new Date()
  if (start.getTime() < now.getTime() + (opts.minLeadMinutes ?? 0) * 60_000 - 2 * 60_000) return 'past'
  if (opts.maxDays && end.getTime() - start.getTime() > opts.maxDays * 86_400_000) return 'too_long'
  return null
}

export function periodErrorMessage(e: PeriodError, opts: { minLeadMinutes?: number; maxDays?: number } = {}): string | null {
  switch (e) {
    case 'missing': return 'Choose a rental start and end date and time.'
    case 'reversed': return 'The rental end must be later than the rental start.'
    case 'past': return opts.minLeadMinutes ? `Rentals must start at least ${opts.minLeadMinutes} minutes from now.` : 'The rental start time has already passed. Choose a later time.'
    case 'too_long': return `A single booking can be at most ${opts.maxDays} days long.`
    default: return null
  }
}
