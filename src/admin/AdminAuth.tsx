import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { adminApi, setUnauthorizedHandler, type LoginResult } from '../lib/api'

// The session token lives only in this tab's sessionStorage. It is not a flag:
// every admin call sends it and the database checks it, so a copied or forged
// value grants nothing.
const KEY = 'gr.admin-session'

type Status = 'checking' | 'signed-in' | 'signed-out'

interface Ctx {
  status: Status
  token: string
  notice: string | null
  login: (pin: string) => Promise<LoginResult>
  logout: () => Promise<void>
  replaceToken: (t: string) => void
}

const AdminAuthContext = createContext<Ctx | null>(null)

const readToken = () => {
  try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' }
}
const writeToken = (t: string) => {
  try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(readToken)
  const [status, setStatus] = useState<Status>(token ? 'checking' : 'signed-out')
  const [notice, setNotice] = useState<string | null>(null)
  const [idleMinutes, setIdleMinutes] = useState(30)
  const lastActivity = useRef(Date.now())

  const end = useCallback((message: string | null) => {
    writeToken('')
    setToken('')
    setStatus('signed-out')
    setNotice(message)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => end('Your admin session has ended. Enter your PIN again.'))
    return () => setUnauthorizedHandler(null)
  }, [end])

  useEffect(() => {
    if (!token || status !== 'checking') return
    adminApi.session(token).then(
      (s) => { setIdleMinutes(s.idle_timeout_minutes); setStatus('signed-in') },
      () => end(null),
    )
  }, [token, status, end])

  // Sign out locally after inactivity. The server enforces the same limit.
  useEffect(() => {
    if (status !== 'signed-in') return
    const bump = () => { lastActivity.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > idleMinutes * 60_000) {
        adminApi.logout(token).catch(() => {})
        end('You were signed out after a period of inactivity.')
      }
    }, 15_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      clearInterval(timer)
    }
  }, [status, idleMinutes, token, end])

  const login = async (pin: string) => {
    const res = await adminApi.login(pin)
    if (res.ok) {
      writeToken(res.token)
      setToken(res.token)
      setIdleMinutes(res.idle_timeout_minutes)
      lastActivity.current = Date.now()
      setNotice(null)
      setStatus('signed-in')
    }
    return res
  }

  const logout = async () => {
    await adminApi.logout(token).catch(() => {})
    end('You have logged out.')
  }

  const replaceToken = (t: string) => { writeToken(t); setToken(t) }

  return <AdminAuthContext.Provider value={{ status, token, notice, login, logout, replaceToken }}>{children}</AdminAuthContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdmin must be used inside AdminAuthProvider')
  return ctx
}

/** Runs an admin request with the current token and tracks loading and errors. */
export function useAdminQuery<T>(fn: (token: string) => Promise<T>, deps: unknown[]) {
  const { token } = useAdmin()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const run = useCallback(() => {
    const id = ++seq.current
    setLoading(true)
    fn(token)
      .then((d) => { if (id === seq.current) { setData(d); setError(null) } })
      .catch((e: Error) => { if (id === seq.current) setError(e.message) })
      .finally(() => { if (id === seq.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ...deps])

  useEffect(run, [run])
  return { data, error, loading, reload: run, setData }
}
