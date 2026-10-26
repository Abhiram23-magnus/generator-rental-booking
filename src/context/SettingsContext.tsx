import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { PublicSettings } from '../lib/types'
import { DEFAULT_TZ } from '../lib/time'

export const FALLBACK_SETTINGS: PublicSettings = {
  business_name: 'Generator Rental Services',
  tagline: 'Reliable generator rental solutions for events, construction sites, businesses and emergency power needs.',
  contact_phone: null,
  contact_whatsapp: null,
  contact_email: null,
  contact_address: null,
  business_hours: null,
  time_zone: DEFAULT_TZ,
  min_lead_minutes: 0,
  max_booking_days: 60,
  pricing: {
    billing_mode: 'exact', minimum_billable_hours: 0, delivery_charge: 0, delivery_charge_label: 'Delivery and pickup',
    discount_percent: 0, discount_label: 'Discount', tax_percent: 0, tax_label: 'GST', time_zone: DEFAULT_TZ,
  },
}

interface Ctx {
  settings: PublicSettings
  loaded: boolean
  error: string | null
  reload: () => Promise<void>
}

const SettingsContext = createContext<Ctx>({ settings: FALLBACK_SETTINGS, loaded: false, error: null, reload: async () => {} })

export function SettingsProvider({ children, initial }: { children: ReactNode; initial?: PublicSettings }) {
  const [settings, setSettings] = useState<PublicSettings>(initial ?? FALLBACK_SETTINGS)
  const [loaded, setLoaded] = useState(Boolean(initial))
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    try {
      setSettings(await api.publicSettings())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    if (!initial) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.title = settings.business_name
  }, [settings.business_name])

  return <SettingsContext.Provider value={{ settings, loaded, error, reload }}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
