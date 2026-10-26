import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { SiteLayout } from './components/Layout'
import { LoadingBlock } from './components/Spinner'
import { SettingsProvider } from './context/SettingsContext'
import { BookingDraftProvider } from './context/BookingDraftContext'
import { AdminAuthProvider } from './admin/AdminAuth'
import { isConfigured } from './lib/supabase'
import Home from './pages/Home'
import Generators from './pages/Generators'
import Booking from './pages/Booking'
import BookingConfirmed from './pages/BookingConfirmed'
import MyBooking from './pages/MyBooking'
import NotFound from './pages/NotFound'

// The admin area is a separate bundle so customers never download it.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const Overview = lazy(() => import('./pages/admin/Overview'))
const Bookings = lazy(() => import('./pages/admin/Bookings'))
const Calendar = lazy(() => import('./pages/admin/Calendar'))
const GeneratorsAdmin = lazy(() => import('./pages/admin/GeneratorsAdmin'))
const Customers = lazy(() => import('./pages/admin/Customers'))
const SettingsAdmin = lazy(() => import('./pages/admin/SettingsAdmin'))

function NotConfigured() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <h1 className="text-2xl font-bold">The site is not connected to its database yet</h1>
      <p className="mt-3 text-steel">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example and the README), then rebuild.</p>
    </div>
  )
}

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <MotionConfig reducedMotion="user">
      <SettingsProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingBlock label="Loading" />}>
            <Routes>
              <Route element={<BookingDraftProvider><SiteLayout /></BookingDraftProvider>}>
                <Route index element={<Home />} />
                <Route path="generators" element={<Generators />} />
                <Route path="book" element={<Booking />} />
                <Route path="booking/:reference" element={<BookingConfirmed />} />
                <Route path="my-booking" element={<MyBooking />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="admin" element={<AdminAuthProvider><AdminLayout /></AdminAuthProvider>}>
                <Route index element={<Overview />} />
                <Route path="bookings" element={<Bookings />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="generators" element={<GeneratorsAdmin />} />
                <Route path="customers" element={<Customers />} />
                <Route path="settings" element={<SettingsAdmin />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SettingsProvider>
    </MotionConfig>
  )
}
