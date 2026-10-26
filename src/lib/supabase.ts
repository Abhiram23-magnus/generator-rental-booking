import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// The anon key is public by design. Every table is closed to it; the site only
// calls database functions that validate their own input and authorisation.
export const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_ANON_KEY || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

export const functionsUrl = `${SUPABASE_URL}/functions/v1`
export const anonKey = SUPABASE_ANON_KEY
