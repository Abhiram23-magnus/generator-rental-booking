import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Calculator, CircleCheck, ShieldCheck } from 'lucide-react'
import { RentalPeriodPicker, usePeriodState } from '../components/RentalPeriodPicker'
import { DieselEstimate, PriceBreakdown } from '../components/PriceBreakdown'
import { GeneratorPhoto } from '../components/GeneratorCard'
import { AvailabilityBadge } from '../components/StatusBadge'
import { ErrorNote, Spinner } from '../components/Spinner'
import { useBookingDraft } from '../context/BookingDraftContext'
import { useSettings } from '../context/SettingsContext'
import { ApiError, api } from '../lib/api'
import { formatDateTime, formatINR, formatNumber } from '../lib/format'
import { computeQuote } from '../lib/pricing'
import type { Availability, GeneratorListing, Quote } from '../lib/types'
import { bookingFormSchema, normalizeMobile } from '../lib/validation'

const customerSchema = bookingFormSchema.pick({ full_name: true, mobile_number: true, email: true, rental_location: true, landmark: true, notes: true })
type CustomerValues = import('zod').infer<typeof customerSchema>

export default function Booking() {
  const { settings } = useSettings()
  const { generatorId, period, setPeriod } = useBookingDraft()
  const { start, end, error: periodError, message: periodMessage } = usePeriodState(period)
  const navigate = useNavigate()

  const [generator, setGenerator] = useState<GeneratorListing | null>(null)
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [bookedUntil, setBookedUntil] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [serverQuote, setServerQuote] = useState<{ quote: Quote; at: Date; key: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    mode: 'onTouched',
    defaultValues: { full_name: '', mobile_number: '', email: '', rental_location: '', landmark: '', notes: '' },
  })

  const periodKey = `${start?.getTime()}-${end?.getTime()}`
  const valid = !periodError && !!start && !!end

  // Load the generator and refresh availability whenever the period changes.
  useEffect(() => {
    if (!generatorId) return
    let cancelled = false
    setChecking(true)
    const t = setTimeout(() => {
      api.listGenerators(valid ? start : null, valid ? end : null)
        .then((rows) => {
          if (cancelled) return
          const g = rows.find((r) => r.id === generatorId) ?? null
          setGenerator(g)
          setAvailability(g?.availability ?? null)
          setBookedUntil(g?.booked_until ?? null)
          setLoadError(g ? null : 'This generator is no longer listed. Choose another one.')
        })
        .catch((e: Error) => !cancelled && setLoadError(e.message))
        .finally(() => !cancelled && setChecking(false))
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatorId, periodKey, valid])

  const localQuote = useMemo(() => {
    if (!generator || !valid) return null
    return computeQuote(start!, end!, generator.hourly_rental_rate, generator.diesel_consumption_lph, settings.pricing)
  }, [generator, valid, start, end, settings.pricing])

  const shownQuote = serverQuote && serverQuote.key === periodKey ? serverQuote.quote : localQuote

  if (!generatorId) return <Navigate to="/generators" replace />

  const calculate = async () => {
    if (!valid || !generatorId) return
    setChecking(true)
    setSubmitError(null)
    try {
      const q = await api.quote(generatorId, start!, end!)
      setServerQuote({ quote: q.quote, at: new Date(), key: periodKey })
      setAvailability(q.availability)
      setBookedUntil(q.booked_until)
      setGenerator((g) => (g ? { ...g, ...q.generator } : g))
    } catch (e) {
      setSubmitError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const confirm = handleSubmit(async (values) => {
    setSubmitError(null)
    if (!valid) { setSubmitError(periodMessage); return }
    setSubmitting(true)
    try {
      // fresh availability check immediately before confirming
      const q = await api.quote(generatorId, start!, end!)
      setAvailability(q.availability)
      setBookedUntil(q.booked_until)
      if (q.availability !== 'available') {
        setSubmitError(q.availability === 'booked'
          ? 'This generator was booked for part of your period while you were filling in the form. Choose another time or generator.'
          : 'This generator cannot be booked right now. Choose another one.')
        return
      }
      const receipt = await api.createBooking({
        generator_id: generatorId,
        start_at: start!.toISOString(),
        end_at: end!.toISOString(),
        full_name: values.full_name.trim(),
        mobile_number: normalizeMobile(values.mobile_number)!,
        email: values.email?.trim() || undefined,
        rental_location: values.rental_location.trim(),
        landmark: values.landmark?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      })
      navigate(`/booking/${receipt.booking_reference}?t=${receipt.receipt_token}`, { state: { receipt, justBooked: true } })
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'SLOT_TAKEN') setAvailability('booked')
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  })

  const canConfirm = availability === 'available' && valid && !checking && !submitting

  return (
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-8 sm:px-6 lg:pb-16">
      <Link to="/generators" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-steel hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Back to generators
      </Link>
      <h1 className="font-wide mt-3 text-3xl font-extrabold sm:text-4xl">Booking details</h1>

      {loadError && <div className="mt-6"><ErrorNote message={loadError} /></div>}

      <form onSubmit={confirm} noValidate className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="panel overflow-hidden" aria-labelledby="gen-h">
            <div className="flex items-center gap-4 p-4 sm:p-5">
              <div className="h-20 w-32 shrink-0 overflow-hidden rounded-[4px] bg-concrete">
                {generator && <GeneratorPhoto g={generator} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="gen-h" className="font-wide text-2xl font-black">{generator ? `${formatNumber(generator.capacity_kva)} kVA` : 'Loading…'}</h2>
                {generator && (
                  <p className="text-[15px] text-steel">
                    {formatINR(generator.hourly_rental_rate)}/hour. Diesel about {formatNumber(generator.diesel_consumption_lph)} litres/hour.
                  </p>
                )}
              </div>
              <div className="hidden sm:block">{checking ? <Spinner label="Checking availability" /> : availability && <AvailabilityBadge value={availability} />}</div>
            </div>
            <div className="border-t border-line px-4 py-2 sm:hidden">{checking ? <Spinner label="Checking availability" /> : availability && <AvailabilityBadge value={availability} />}</div>
            {availability === 'booked' && bookedUntil && (
              <p className="border-t border-line bg-busy-soft px-5 py-3 text-[15px] text-busy">
                Already booked during your period, until {formatDateTime(bookedUntil, settings.time_zone)}. Change your times or <Link to="/generators" className="font-semibold underline">choose another generator</Link>.
              </p>
            )}
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="period-h">
            <h2 id="period-h" className="mb-4 text-lg font-bold">Rental schedule</h2>
            <RentalPeriodPicker value={period} onChange={setPeriod} idPrefix="book" />
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="cust-h">
            <h2 id="cust-h" className="mb-4 text-lg font-bold">Your details</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="full_name" className="field-label">Full name</label>
                <input id="full_name" className="input" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />
                {errors.full_name && <p className="field-error">{errors.full_name.message}</p>}
              </div>
              <div>
                <label htmlFor="mobile_number" className="field-label">Mobile number</label>
                <input id="mobile_number" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210"
                  aria-invalid={!!errors.mobile_number} aria-describedby="mobile-hint" {...register('mobile_number')} />
                {errors.mobile_number ? <p className="field-error">{errors.mobile_number.message}</p> : <p id="mobile-hint" className="field-hint">With or without +91.</p>}
              </div>
              <div>
                <label htmlFor="email" className="field-label">Email <span className="font-normal text-steel">(optional)</span></label>
                <input id="email" className="input" type="email" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
                {errors.email && <p className="field-error">{errors.email.message}</p>}
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="del-h">
            <h2 id="del-h" className="mb-4 text-lg font-bold">Delivery</h2>
            <div className="space-y-5">
              <div>
                <label htmlFor="rental_location" className="field-label">Delivery location or complete address</label>
                <textarea id="rental_location" rows={3} className="input" autoComplete="street-address" aria-invalid={!!errors.rental_location} {...register('rental_location')} />
                {errors.rental_location && <p className="field-error">{errors.rental_location.message}</p>}
              </div>
              <div>
                <label htmlFor="landmark" className="field-label">Landmark or delivery instructions <span className="font-normal text-steel">(optional)</span></label>
                <input id="landmark" className="input" aria-invalid={!!errors.landmark} {...register('landmark')} />
                {errors.landmark && <p className="field-error">{errors.landmark.message}</p>}
              </div>
              <div>
                <label htmlFor="notes" className="field-label">Notes or special requirements <span className="font-normal text-steel">(optional)</span></label>
                <textarea id="notes" rows={3} className="input" placeholder="For example: cable length needed, loads you plan to run" aria-invalid={!!errors.notes} {...register('notes')} />
                {errors.notes && <p className="field-error">{errors.notes.message}</p>}
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24" aria-labelledby="est-h">
          <div className="panel p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 id="est-h" className="text-lg font-bold">Your estimate</h2>
              {serverQuote?.key === periodKey && (
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ok"><CircleCheck size={14} aria-hidden /> Checked with live prices</span>
              )}
            </div>
            <div className="mt-3">
              {shownQuote && generator ? (
                <PriceBreakdown quote={shownQuote} pricing={settings.pricing} capacityKva={generator.capacity_kva} />
              ) : (
                <p className="py-6 text-[15px] text-steel">{periodError ? periodMessage : 'Loading prices…'}</p>
              )}
            </div>

            <div className="mt-5 grid gap-3">
              <button type="button" className="btn-ghost" onClick={calculate} disabled={!valid || checking || !generator}>
                {checking ? <Spinner label="Calculating" /> : <Calculator size={18} aria-hidden />} Calculate Estimate
              </button>
              <button type="submit" className="btn-amber hidden py-4 text-base lg:inline-flex" disabled={!canConfirm}>
                {submitting ? <><Spinner label="Confirming" /> Confirming…</> : 'Confirm Booking'}
              </button>
            </div>

            <AnimatePresence>
              {submitError && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4">
                  <ErrorNote message={submitError} />
                </motion.div>
              )}
            </AnimatePresence>

            <p className="mt-4 flex gap-2 text-[13px] text-steel">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden />
              We check availability again and calculate the final amount from our current prices when you confirm.
            </p>
          </div>

          {shownQuote && (
            <div className="panel mt-5 p-5 sm:p-6">
              <DieselEstimate quote={shownQuote} />
            </div>
          )}
        </aside>

        {/* phone: keep the total and the confirm button in reach */}
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="text-[13px] text-steel">Total payable</p>
              <p className="font-wide text-xl font-black tabular">{shownQuote ? formatINR(shownQuote.total_amount) : '—'}</p>
            </div>
            <button type="submit" className="btn-amber" disabled={!canConfirm}>
              {submitting ? <><Spinner label="Confirming" /> Confirming…</> : 'Confirm Booking'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
