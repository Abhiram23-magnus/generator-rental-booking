import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarDays, ClipboardList, Gauge, LogOut, Menu, Settings, Users, X, Zap, ExternalLink } from 'lucide-react'
import { LogoMark } from '../../components/Layout'
import { LoadingBlock } from '../../components/Spinner'
import { useAdmin } from '../../admin/AdminAuth'
import { useSettings } from '../../context/SettingsContext'
import AdminLogin from './AdminLogin'

const NAV = [
  { to: '/admin', label: 'Overview', Icon: Gauge, end: true },
  { to: '/admin/bookings', label: 'Bookings', Icon: ClipboardList },
  { to: '/admin/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/admin/generators', label: 'Generators', Icon: Zap },
  { to: '/admin/customers', label: 'Customers', Icon: Users },
  { to: '/admin/settings', label: 'Settings', Icon: Settings },
]

export default function AdminLayout() {
  const { status, logout } = useAdmin()
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) { setLastPath(pathname); setOpen(false) }

  if (status === 'checking') return <div className="min-h-dvh bg-concrete"><LoadingBlock label="Checking your admin session" /></div>
  if (status === 'signed-out') return <AdminLogin />

  const nav = (
    <nav aria-label="Admin">
      <ul className="space-y-1">
        {NAV.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-[15px] font-medium ${isActive ? 'bg-amber text-ink' : 'text-white/75 hover:bg-white/5 hover:text-white'}`}>
              <Icon size={18} aria-hidden /> {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )

  const footer = (
    <div className="space-y-1 border-t border-white/10 pt-4">
      <Link to="/" className="flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-[15px] text-white/70 hover:text-white" target="_blank">
        <ExternalLink size={18} aria-hidden /> View website
      </Link>
      <button type="button" onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-[4px] px-3 py-2.5 text-[15px] text-white/70 hover:text-white">
        <LogOut size={18} aria-hidden /> Logout
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh bg-concrete lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-ink p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2 pt-1 text-white">
          <LogoMark className="h-8 w-8" />
          <span className="font-wide text-sm font-extrabold leading-tight">{settings.business_name}</span>
        </div>
        <div className="flex-1">{nav}</div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 text-white lg:hidden">
        <div className="flex items-center gap-2.5"><LogoMark className="h-8 w-8" /><span className="font-semibold">Admin</span></div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} className="rounded p-2">
          {open ? <X /> : <Menu />}
        </button>
      </header>
      {open && <div className="sticky top-14 z-30 space-y-4 bg-ink px-4 pb-4 lg:hidden">{nav}{footer}</div>}

      <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}
