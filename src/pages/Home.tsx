import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Building2, CalendarClock, Fuel, HardHat, PartyPopper, ReceiptText, Siren, Truck } from 'lucide-react'
import { HeroScene } from '../components/HeroScene'
import { ContactList } from '../components/Layout'
import { useSettings } from '../context/SettingsContext'
import { api } from '../lib/api'
import { formatINR, formatNumber } from '../lib/format'
import type { GeneratorListing } from '../lib/types'

export default function Home() {
  const { settings } = useSettings()
  const reduce = useReducedMotion()
  const [rates, setRates] = useState<GeneratorListing[] | null>(null)

  useEffect(() => {
    api.listGenerators().then((g) => setRates(g.filter((x) => x.is_active)), () => setRates([]))
  }, [])

  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.1 + i * 0.12, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] as const },
  })

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-10 pt-10 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pb-16 md:pt-16">
          <div>
            <motion.p {...rise(0)} className="flex items-center gap-3 text-amber">
              <span className="text-4xl leading-none" role="img" aria-label="Joined hands">🙏</span>
              <span className="font-deva text-[28px] leading-none" lang="hi">नमस्ते</span>
              <span className="text-lg font-medium text-white/70">Namaste</span>
            </motion.p>
            <motion.h1 {...rise(1)} className="font-wide mt-5 text-[34px] font-extrabold leading-[1.05] tracking-[-0.01em] sm:text-5xl lg:text-[58px]">
              Welcome to Our Generator Rental Services
            </motion.h1>
            <motion.p {...rise(2)} className="mt-5 max-w-[34rem] text-lg text-white/75">
              {settings.tagline}
            </motion.p>
            <motion.div {...rise(3)} className="mt-8 flex flex-wrap gap-3">
              <Link to="/generators" className="btn-amber px-7 py-4 text-base">
                Start Booking
              </Link>
              <a href="#rates" className="btn-ghost-dark px-6 py-4 text-base">
                See hourly rates
              </a>
            </motion.div>
          </div>
          <div className="-mx-4 md:mx-0">
            <HeroScene />
          </div>
        </div>
      </section>

      <section id="rates" className="scroll-mt-20 border-b border-line bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-wide text-2xl font-extrabold sm:text-3xl">Hourly rental rates</h2>
              <p className="mt-2 max-w-xl text-steel">
                You pay for the hours you book. Diesel is estimated from each generator's consumption rate so you know how much fuel to plan for.
              </p>
            </div>
            <Link to="/generators" className="btn-ink">Check availability</Link>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <caption className="sr-only">Hourly rental rate and estimated diesel consumption for each generator</caption>
              <thead>
                <tr className="border-b-2 border-ink text-sm text-steel">
                  <th scope="col" className="py-3 pr-4 font-semibold">Capacity</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Rental per hour</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Diesel per hour (estimate)</th>
                  <th scope="col" className="py-3 font-semibold">8-hour day</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rates === null &&
                  Array.from({ length: 7 }, (_, i) => (
                    <tr key={i} className="border-b border-line">
                      <td colSpan={4} className="py-4"><div className="h-5 w-2/3 animate-pulse rounded bg-concrete" /></td>
                    </tr>
                  ))}
                {rates?.map((g) => (
                  <tr key={g.id} className="border-b border-line">
                    <th scope="row" className="font-wide whitespace-nowrap py-4 pr-4 text-xl font-extrabold">{formatNumber(g.capacity_kva)} kVA</th>
                    <td className="py-4 pr-4 text-lg font-semibold">{formatINR(g.hourly_rental_rate)}<span className="text-sm font-normal text-steel">/hour</span></td>
                    <td className="py-4 pr-4">{formatNumber(g.diesel_consumption_lph)} litres/hour</td>
                    <td className="py-4 text-steel">
                      <span className="block font-medium text-ink">{formatINR(g.hourly_rental_rate * 8)}</span>
                      <span className="text-sm">about {formatNumber(g.diesel_consumption_lph * 8)} litres of diesel</span>
                    </td>
                  </tr>
                ))}
                {rates?.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-steel">Rates are being updated. Open the generators page to see what is available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-wide text-2xl font-extrabold sm:text-3xl">Book in three steps</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            { Icon: CalendarClock, title: 'Pick your dates and generator', body: 'Enter when you need power. We show which generators are free for exactly that period.' },
            { Icon: Truck, title: 'Tell us where to deliver', body: 'Add your name, mobile number and the site address. See the full price and diesel estimate before you confirm.' },
            { Icon: ReceiptText, title: 'Get your receipt', body: 'Your booking is confirmed instantly. Download or print the receipt and keep the booking reference.' },
          ].map(({ Icon, title, body }, i) => (
            <li key={title} className="relative border-t-4 border-amber bg-paper p-6">
              <span className="font-wide absolute right-5 top-4 text-4xl font-black text-concrete" aria-hidden>{i + 1}</span>
              <Icon className="text-amber-ink" aria-hidden />
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-steel">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-graphite text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="font-wide text-2xl font-extrabold sm:text-3xl">Power for wherever you are working</h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {[
                { Icon: PartyPopper, t: 'Weddings and events', d: 'Silent sets for lighting, sound and catering.' },
                { Icon: HardHat, t: 'Construction sites', d: 'Steady supply for tools, pumps and site offices.' },
                { Icon: Building2, t: 'Shops and offices', d: 'Keep billing, cooling and servers running.' },
                { Icon: Siren, t: 'Emergency backup', d: 'Fast replacement power during outages.' },
              ].map(({ Icon, t, d }) => (
                <li key={t} className="flex gap-3">
                  <Icon className="mt-0.5 shrink-0 text-amber" aria-hidden />
                  <div>
                    <p className="font-semibold">{t}</p>
                    <p className="text-[15px] text-white/65">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[6px] border border-white/15 p-6">
            <div className="flex items-center gap-2 text-amber">
              <Fuel aria-hidden />
              <h2 className="text-lg font-bold text-white">Talk to us</h2>
            </div>
            <p className="mt-2 text-white/65">Not sure which capacity you need? Call with a list of what you plan to run and we will help you choose.</p>
            <div className="mt-5">
              <ContactList dark />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
