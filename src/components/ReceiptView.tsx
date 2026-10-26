import { Fuel } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { DIESEL_DISCLAIMER } from './PriceBreakdown'
import { formatDateTime, formatINR, formatMobile, formatNumber } from '../lib/format'
import { formatDuration } from '../lib/pricing'
import type { Receipt } from '../lib/types'

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 sm:grid sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-steel">{label}</dt>
      <dd className="mt-0.5 font-medium sm:mt-0">{children}</dd>
    </div>
  )
}

export function ReceiptView({ r }: { r: Receipt }) {
  const tz = r.business.time_zone
  return (
    <article className="print-plain overflow-hidden rounded-[6px] border border-line bg-paper" aria-label={`Receipt for booking ${r.booking_reference}`}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-amber bg-ink px-5 py-5 text-white sm:px-7">
        <div>
          <p className="font-wide font-extrabold">{r.business.business_name}</p>
          <p className="mt-1 text-sm text-white/65">{[r.business.contact_phone, r.business.contact_email].filter(Boolean).join('  |  ')}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-white/65">Booking reference</p>
          <p className="font-wide text-xl font-black tracking-wide">{r.booking_reference}</p>
        </div>
      </header>

      <div className="grid gap-x-10 px-5 py-5 sm:px-7 md:grid-cols-2">
        <section>
          <h2 className="mb-1 font-bold">Customer and delivery</h2>
          <dl className="divide-y divide-line">
            <Item label="Name">{r.customer.full_name}</Item>
            <Item label="Mobile">{formatMobile(r.customer.mobile_number)}</Item>
            {r.customer.email && <Item label="Email">{r.customer.email}</Item>}
            <Item label="Delivery location"><span className="whitespace-pre-line">{r.rental_location}</span></Item>
            {r.landmark && <Item label="Landmark or instructions">{r.landmark}</Item>}
            {r.notes && <Item label="Notes">{r.notes}</Item>}
          </dl>
        </section>
        <section className="mt-6 md:mt-0">
          <h2 className="mb-1 font-bold">Rental</h2>
          <dl className="divide-y divide-line">
            <Item label="Status"><StatusBadge value={r.status} /></Item>
            <Item label="Generator">{formatNumber(r.generator.capacity_kva)} kVA</Item>
            <Item label="Start">{formatDateTime(r.start_at, tz)}</Item>
            <Item label="End">{formatDateTime(r.end_at, tz)}</Item>
            <Item label="Total duration">{formatDuration(r.duration_seconds)}</Item>
            <Item label="Booked on">{formatDateTime(r.created_at, tz)}</Item>
          </dl>
        </section>
      </div>

      <div className="grid gap-x-10 border-t border-line px-5 py-5 sm:px-7 md:grid-cols-2">
        <section>
          <h2 className="mb-1 font-bold">Charges</h2>
          <dl className="divide-y divide-line tabular">
            <Item label="Hourly rental rate">{formatINR(r.hourly_rate)}/hour</Item>
            {Number(r.billable_hours) !== Number(r.duration_hours) && <Item label="Billed hours">{formatNumber(r.billable_hours)} hours</Item>}
            <Item label="Rental charge">{formatINR(r.rental_charge)}</Item>
            {r.additional_charges > 0 && <Item label={r.pricing.delivery_charge_label}>{formatINR(r.additional_charges)}</Item>}
            {r.discount > 0 && <Item label={`${r.pricing.discount_label} (${formatNumber(r.pricing.discount_percent)}%)`}>− {formatINR(r.discount)}</Item>}
            {r.tax > 0 && <Item label={`${r.pricing.tax_label} (${formatNumber(r.pricing.tax_percent)}%)`}>{formatINR(r.tax)}</Item>}
          </dl>
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-3">
            <span className="font-bold">Final amount payable</span>
            <span className="font-wide text-2xl font-black tabular">{formatINR(r.total_amount)}</span>
          </div>
        </section>
        <section className="mt-6 md:mt-0">
          <h2 className="mb-1 flex items-center gap-2 font-bold"><Fuel size={17} className="text-amber-ink" aria-hidden /> Diesel estimate</h2>
          <dl className="divide-y divide-line tabular">
            <Item label="Consumption per hour">{formatNumber(r.diesel_consumption_lph)} litres</Item>
            <Item label="Estimated total diesel">{formatNumber(r.estimated_diesel_litres)} litres</Item>
          </dl>
          <p className="mt-3 text-[13px] leading-relaxed text-steel">Assumes continuous operation for the complete scheduled period. {DIESEL_DISCLAIMER}</p>
        </section>
      </div>
    </article>
  )
}
