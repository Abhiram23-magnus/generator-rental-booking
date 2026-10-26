import { Fuel, IndianRupee } from 'lucide-react'
import { GeneratorArt } from './GeneratorArt'
import { AvailabilityBadge } from './StatusBadge'
import { formatDateTime, formatINR, formatNumber } from '../lib/format'
import type { GeneratorListing, Pricing } from '../lib/types'
import { computeQuote } from '../lib/pricing'

function Rivet({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-2 w-2 rounded-full bg-gradient-to-br from-white to-[#9aa1a8] shadow-[inset_0_-1px_1px_rgba(0,0,0,.35)] ${className}`} />
}

export function GeneratorPhoto({ g, className = '' }: { g: { capacity_kva: number; image_url: string | null; name?: string | null }; className?: string }) {
  return g.image_url ? (
    <img src={g.image_url} alt={`${formatNumber(g.capacity_kva)} kVA generator`} loading="lazy" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <GeneratorArt kva={g.capacity_kva} className={`h-full w-full ${className}`} />
  )
}

export function GeneratorCard({ g, period, pricing, timeZone, loading, onSelect }: {
  g: GeneratorListing
  period: { start: Date; end: Date } | null
  pricing: Pricing
  timeZone: string
  loading: boolean
  onSelect: () => void
}) {
  const bookable = g.availability === 'available' && !loading
  const estimate = period && g.is_active ? computeQuote(period.start, period.end, g.hourly_rental_rate, g.diesel_consumption_lph, pricing) : null

  return (
    <article className={`group flex flex-col overflow-hidden rounded-[6px] border bg-paper transition-shadow ${bookable ? 'border-line hover:shadow-[0_10px_30px_-12px_rgba(31,34,38,.35)]' : 'border-line/70'}`}>
      <div className="relative aspect-[5/3] bg-gradient-to-b from-[#f7f8f9] to-[#e3e6e9]">
        <GeneratorPhoto g={g} className={g.availability === 'inactive' ? 'opacity-50 grayscale' : ''} />
        <div className="absolute left-3 top-3">
          {loading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/90 px-2.5 py-1 text-[13px] font-semibold text-steel">Checking…</span>
          ) : (
            <AvailabilityBadge value={g.availability} />
          )}
        </div>
      </div>

      <div className="relative mx-4 -mt-5 rounded-[4px] border border-[#c4c9ce] bg-gradient-to-b from-[#fbfbfc] to-[#eef0f2] px-5 pb-4 pt-4 shadow-sm">
        <Rivet className="left-2 top-2" /><Rivet className="right-2 top-2" /><Rivet className="bottom-2 left-2" /><Rivet className="bottom-2 right-2" />
        <h3 className="font-wide flex items-baseline gap-1.5 text-[44px] font-black leading-none tracking-tight">
          {formatNumber(g.capacity_kva)}
          <span className="text-lg font-bold text-iron">kVA</span>
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 border-t border-[#c4c9ce] pt-3 text-sm">
          <div>
            <dt className="flex items-center gap-1 text-steel"><IndianRupee size={13} aria-hidden /> Rental</dt>
            <dd className="mt-0.5 text-base font-bold tabular">{formatINR(g.hourly_rental_rate)}/hour</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-steel"><Fuel size={13} aria-hidden /> Diesel (estimate)</dt>
            <dd className="mt-0.5 text-base font-bold tabular">{formatNumber(g.diesel_consumption_lph)} litres/hour</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        {g.description && <p className="text-[15px] text-steel">{g.description}</p>}
        {estimate && g.availability === 'available' && (
          <p className="mt-3 text-[15px]">
            For your period: <strong className="tabular">{formatINR(estimate.total_amount)}</strong>
            <span className="text-steel"> and about {formatNumber(estimate.estimated_diesel_litres)} L of diesel</span>
          </p>
        )}
        {g.availability === 'booked' && g.booked_until && (
          <p className="mt-3 text-[15px] text-busy">Booked during your period, until {formatDateTime(g.booked_until, timeZone)}.</p>
        )}
        <div className="mt-auto pt-5">
          <button type="button" className="btn-amber w-full" disabled={!bookable} onClick={onSelect}
            aria-label={`Book the ${formatNumber(g.capacity_kva)} kVA generator`}>
            {g.availability === 'available' ? 'Book now' : g.availability === 'booked' ? 'Not free for these dates' : 'Not available to book'}
          </button>
        </div>
      </div>
    </article>
  )
}
