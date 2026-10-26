import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useAnimationControls } from 'framer-motion'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { LogoMark } from '../../components/Layout'
import { Spinner } from '../../components/Spinner'
import { useAdmin } from '../../admin/AdminAuth'
import { useSettings } from '../../context/SettingsContext'

function minutes(s: number) {
  const m = Math.ceil(s / 60)
  return `${m} minute${m === 1 ? '' : 's'}`
}

export default function AdminLogin() {
  const { settings } = useSettings()
  const { login, notice } = useAdmin()
  const [pin, setPin] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shake = useAnimationControls()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{4}$/.test(pin)) {
      setError('Enter all four digits of your PIN.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await login(pin)
      if (!res.ok) {
        setPin('')
        if (res.error === 'LOCKED') setError(`Too many incorrect attempts. Login is locked for ${minutes(res.retry_after_seconds ?? 900)}.`)
        else if (res.error === 'NOT_CONFIGURED') setError('No admin PIN has been set up yet. Follow "Setting and changing the admin PIN" in the README.')
        else setError(res.attempts_remaining === 0
          ? 'That PIN is not correct. Login is now locked for 15 minutes.'
          : `That PIN is not correct. ${res.attempts_remaining} attempt${res.attempts_remaining === 1 ? '' : 's'} left before login is locked.`)
        void shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } })
        input.current?.focus()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink px-4 py-10">
      <motion.div animate={shake} className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <LogoMark className="h-10 w-10" />
          <span className="font-wide text-lg font-extrabold">{settings.business_name}</span>
        </div>
        <form onSubmit={submit} className="rounded-[6px] bg-paper p-7" noValidate>
          <div className="flex items-center gap-2">
            <LockKeyhole size={20} className="text-amber-ink" aria-hidden />
            <h1 className="text-xl font-bold">Admin dashboard</h1>
          </div>
          <p className="mt-1 text-[15px] text-steel">Enter your four-digit PIN.</p>

          {notice && <p className="mt-4 rounded-[4px] bg-concrete px-3 py-2 text-sm text-iron" role="status">{notice}</p>}

          <label htmlFor="pin" className="field-label mt-5">PIN</label>
          <div className="relative">
            <input
              ref={input}
              id="pin"
              name="pin"
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-invalid={!!error}
              aria-describedby={error ? 'pin-error' : undefined}
              className="input font-wide pr-12 text-center text-3xl font-black tracking-[0.6em]"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-steel hover:text-ink"
              aria-label={show ? 'Hide PIN' : 'Show PIN'} aria-pressed={show}>
              {show ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {error && <p id="pin-error" className="field-error" role="alert">{error}</p>}

          <button type="submit" className="btn-amber mt-6 w-full py-3.5" disabled={busy}>
            {busy ? <><Spinner label="Checking PIN" /> Checking…</> : 'Login'}
          </button>
        </form>
        <p className="mt-5 text-center"><Link to="/" className="text-sm text-white/60 hover:text-white">Back to the website</Link></p>
      </motion.div>
    </div>
  )
}
