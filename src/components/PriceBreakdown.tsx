import { AnimatePresence, motion } from 'framer-motion'
import { Fuel, Info } from 'lucide-react'
import { formatINR, formatNumber } from '../lib/format'
import { formatDuration, BILLING_MODE_LABELS } from '../lib/pricing'
import type { Pricing, Quote } from '../lib/types'

export const DIESEL_DISCLAIMER =
  'Diesel consumption is an estimate based on the configured consumption rate and scheduled rental duration. Actual consumption may vary depending on generator model, electrical load, operating conditions and actual running time.'

function Row({ label, value, strong = false, muted = false }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? 'text-base font-bold' : 'text-[15px]'}`}>
      <dt className={muted ? 'text-steel' : ''}>{label}</dt>
      <dd className="text-right tabular">{value}</dd>
    </div>
  )
}

export function PriceBreakdown({ quote, pricing, capacityKva }: { quote: Quote; pricing: Pricing; capacityKva: number }) {
  const billedDiffers = quote.billable_seconds !== quote.duration_seconds
  return (
    <div>
      <dl className="divide-y divide-line">
        <Row label="Selected generator" value={`${formatNumber(capacityKva)} kVA`} muted />
        <Row label="Hourly rental rate" value={`${formatINR(quote.hourly_rate)}/hour`} muted />
        <Row label="Rental duration" value={formatDuration(quote.duration_seconds)} muted />
        {billedDiffers && (
          <Row
            label={<span title={BILLING_MODE_LABELS[pricing.billing_mode]}>Billed hours</span>}
            value={`${formatNumber(quote.billable_hours)} hours`}
            muted
          />
        )}
        <Row label="Rental charge" value={formatINR(quote.rental_charge)} />
        {quote.additional_charges > 0 && <Row label={pricing.delivery_charge_label} value={formatINR(quote.additional_charges)} />}
        {quote.discount > 0 && <Row label={`${pricing.discount_label} (${formatNumber(pricing.discount_percent)}%)`} value={`− ${formatINR(quote.discount)}`} />}
        {quote.tax > 0 && <Row label={`${pricing.tax_label} (${formatNumber(pricing.tax_percent)}%)`} value={formatINR(quote.tax)} />}
      </dl>
      <div className="mt-2 flex items-baseline justify-between gap-4 border-t-2 border-ink pt-3">
        <span className="font-bold">Total amount payable</span>
        <span className="font-wide text-2xl font-black tabular" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={quote.total_amount} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.18 }} className="inline-block">
              {formatINR(quote.total_amount)}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      {billedDiffers && <p className="mt-2 text-[13px] text-steel">Billing rule: {BILLING_MODE_LABELS[pricing.billing_mode].toLowerCase()}{pricing.minimum_billable_hours > 0 ? `, minimum ${formatNumber(pricing.minimum_billable_hours)} hours` : ''}.</p>}
    </div>
  )
}

export function DieselEstimate({ quote }: { quote: Quote }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Fuel size={18} className="text-amber-ink" aria-hidden />
        <h3 className="font-bold">Estimated diesel requirement</h3>
      </div>
      <dl className="mt-2 divide-y divide-line">
        <Row label="Consumption" value={`${formatNumber(quote.diesel_consumption_lph)} litres/hour`} muted />
        <Row label="Total rental hours" value={`${formatNumber(quote.duration_hours)} hours`} muted />
        <Row label="Diesel required" value={`${formatNumber(quote.estimated_diesel_litres)} litres`} strong />
      </dl>
      <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-steel">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          This estimate assumes the generator runs continuously for the complete scheduled period. {DIESEL_DISCLAIMER}
        </span>
      </p>
    </div>
  )
}
