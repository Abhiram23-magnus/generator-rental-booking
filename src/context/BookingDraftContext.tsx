import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { defaultRentalPeriod } from '../lib/time'
import { useSettings } from './SettingsContext'

// The customer's chosen generator and rental period, kept in sessionStorage so a
// refresh keeps their choice without putting ids in the address bar.
export interface Period {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

interface Draft {
  period: Period
  generatorId: string | null
}

interface Ctx extends Draft {
  setPeriod: (p: Period) => void
  selectGenerator: (id: string | null) => void
}

const KEY = 'gr.booking-draft'
const BookingDraftContext = createContext<Ctx | null>(null)

function load(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = load()
    if (saved) return saved
    const d = defaultRentalPeriod(settings.time_zone)
    return { generatorId: null, period: { startDate: d.start.date, startTime: d.start.time, endDate: d.end.date, endTime: d.end.time } }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(draft))
    } catch {
      /* private mode: the draft just won't survive a refresh */
    }
  }, [draft])

  return (
    <BookingDraftContext.Provider
      value={{
        ...draft,
        setPeriod: (period) => setDraft((d) => ({ ...d, period })),
        selectGenerator: (generatorId) => setDraft((d) => ({ ...d, generatorId })),
      }}
    >
      {children}
    </BookingDraftContext.Provider>
  )
}

export function useBookingDraft() {
  const ctx = useContext(BookingDraftContext)
  if (!ctx) throw new Error('useBookingDraft must be used inside BookingDraftProvider')
  return ctx
}
