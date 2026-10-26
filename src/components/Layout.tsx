import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Phone, X, Mail, MapPin, MessageCircle, Clock } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="10" fill="#F2A20C" />
      <path d="M36 9 18 36h12l-4 19 20-29H34z" fill="#1F2226" />
    </svg>
  )
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/generators', label: 'Generators' },
  { to: '/my-booking', label: 'My booking' },
  { to: '/admin', label: 'Admin' },
]

export function SiteHeader() {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  return (
    <header className="no-print sticky top-0 z-40 bg-ink text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3 rounded-sm">
          <LogoMark />
          <span className="font-wide text-[15px] font-extrabold leading-tight sm:text-base">{settings.business_name}</span>
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `rounded-[4px] px-3 py-2 text-[15px] font-medium transition-colors ${isActive ? 'bg-white/10 text-amber' : 'text-white/80 hover:text-white'}`
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="rounded-[4px] p-2 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Main"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/10 md:hidden"
          >
            <ul className="px-4 py-2">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) => `block rounded-[4px] px-3 py-3 text-base ${isActive ? 'text-amber' : 'text-white/85'}`}
                  >
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

export function ContactList({ dark = false }: { dark?: boolean }) {
  const { settings: s } = useSettings()
  const muted = dark ? 'text-white/70' : 'text-steel'
  const items = [
    s.contact_phone && { Icon: Phone, label: s.contact_phone, href: `tel:${s.contact_phone.replace(/\s/g, '')}` },
    s.contact_whatsapp && { Icon: MessageCircle, label: `WhatsApp ${s.contact_whatsapp}`, href: `https://wa.me/${s.contact_whatsapp.replace(/\D/g, '')}` },
    s.contact_email && { Icon: Mail, label: s.contact_email, href: `mailto:${s.contact_email}` },
    s.contact_address && { Icon: MapPin, label: s.contact_address },
    s.business_hours && { Icon: Clock, label: s.business_hours },
  ].filter(Boolean) as { Icon: typeof Phone; label: string; href?: string }[]

  if (!items.length) return <p className={muted}>Contact details will appear here once the owner adds them.</p>
  return (
    <ul className="space-y-2.5">
      {items.map(({ Icon, label, href }) => (
        <li key={label} className="flex items-start gap-3">
          <Icon size={18} className={`mt-0.5 shrink-0 ${dark ? 'text-amber' : 'text-amber-ink'}`} aria-hidden />
          {href ? (
            <a href={href} className="underline-offset-4 hover:underline" target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              {label}
            </a>
          ) : (
            <span className="whitespace-pre-line">{label}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SiteFooter() {
  const { settings } = useSettings()
  return (
    <footer className="no-print bg-ink text-white/85">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark />
            <span className="font-wide font-extrabold text-white">{settings.business_name}</span>
          </div>
          <p className="mt-4 max-w-sm text-[15px] text-white/65">{settings.tagline}</p>
        </div>
        <div>
          <h2 className="mb-3 font-semibold text-white">Contact</h2>
          <ContactList dark />
        </div>
        <div>
          <h2 className="mb-3 font-semibold text-white">Bookings</h2>
          <ul className="space-y-2.5">
            <li><Link to="/generators" className="hover:text-amber">Check availability and prices</Link></li>
            <li><Link to="/my-booking" className="hover:text-amber">Find my booking</Link></li>
            <li><Link to="/admin" className="hover:text-amber">Owner login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-[13px] text-white/50">
        © {new Date().getFullYear()} {settings.business_name}. Prices are per hour, in Indian rupees.
      </div>
    </footer>
  )
}

export function SiteLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-amber focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
