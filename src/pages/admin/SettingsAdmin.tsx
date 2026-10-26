import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { adminApi } from '../../lib/api'
import { useAdmin, useAdminQuery } from '../../admin/AdminAuth'
import { PageHeader, Toast } from '../../admin/ui'
import { ErrorNote, LoadingBlock, Spinner } from '../../components/Spinner'
import { PriceBreakdown } from '../../components/PriceBreakdown'
import { useSettings } from '../../context/SettingsContext'
import { BILLING_MODE_LABELS, computeQuote } from '../../lib/pricing'
import type { AdminSettings, Pricing } from '../../lib/types'

const TIME_ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Colombo', 'Europe/London', 'UTC']

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-sm text-steel">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

function ChangePin() {
  const { token, replaceToken } = useAdmin()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!/^\d{4}$/.test(next)) return setMsg({ ok: false, text: 'The new PIN must be exactly four digits.' })
    if (next !== repeat) return setMsg({ ok: false, text: 'The two new PIN entries do not match.' })
    setBusy(true)
    try {
      const r = await adminApi.changePin(token, current, next)
      if (r.ok) {
        replaceToken(r.token)
        setCurrent(''); setNext(''); setRepeat('')
        setMsg({ ok: true, text: 'PIN changed. Every other admin session has been signed out.' })
      } else {
        setMsg({ ok: false, text: { INVALID_PIN: 'Your current PIN is not correct.', INVALID_FORMAT: 'The new PIN must be exactly four digits.', SAME_PIN: 'Choose a PIN that is different from the current one.', WEAK_PIN: 'That PIN is too easy to guess. Avoid sequences and repeated digits.' }[r.error] })
      }
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) } finally { setBusy(false) }
  }

  const pinInput = (id: string, label: string, v: string, set: (s: string) => void, auto: string) => (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input id={id} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete={auto}
        className="input font-wide text-center text-xl tracking-[0.5em]" value={v} onChange={(e) => set(digits(e.target.value))} />
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        {pinInput('pin-current', 'Current PIN', current, setCurrent, 'current-password')}
        {pinInput('pin-new', 'New PIN', next, setNext, 'new-password')}
        {pinInput('pin-repeat', 'Repeat new PIN', repeat, setRepeat, 'new-password')}
      </div>
      {msg && (msg.ok ? <p className="rounded-[4px] bg-ok-soft px-3 py-2 text-sm text-ok" role="status">{msg.text}</p> : <ErrorNote message={msg.text} />)}
      <button type="submit" className="btn-ink" disabled={busy || current.length !== 4}>{busy ? <Spinner label="Changing PIN" /> : <KeyRound size={17} aria-hidden />} Change PIN</button>
    </form>
  )
}

export default function SettingsAdmin() {
  const { token } = useAdmin()
  const { reload: reloadPublic } = useSettings()
  const { data, error, loading, reload } = useAdminQuery((t) => adminApi.settings(t), [])
  const [s, setS] = useState<AdminSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { if (data) setS(data) }, [data])

  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!s || loading) return <LoadingBlock label="Loading settings" />

  const set = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) => setS({ ...s, [k]: v })
  const numField = (k: keyof AdminSettings, label: string, hint?: string, step = '1') => (
    <div>
      <label htmlFor={`s-${k}`} className="field-label">{label}</label>
      <input id={`s-${k}`} type="number" step={step} min="0" className="input" value={String(s[k] ?? '')}
        onChange={(e) => set(k, (e.target.value === '' ? '' : Number(e.target.value)) as never)} />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
  const textField = (k: keyof AdminSettings, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`s-${k}`} className="field-label">{label}</label>
      <input id={`s-${k}`} className="input" value={String(s[k] ?? '')} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </div>
  )
  const toggle = (k: 'delivery_charge_enabled' | 'discount_enabled' | 'tax_enabled', label: string) => (
    <label className="flex items-center gap-3 font-semibold">
      <input type="checkbox" className="h-5 w-5 accent-amber" checked={s[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  )

  const pricing: Pricing = {
    billing_mode: s.billing_mode, minimum_billable_hours: Number(s.minimum_billable_hours) || 0,
    delivery_charge: s.delivery_charge_enabled ? Number(s.delivery_charge) || 0 : 0, delivery_charge_label: s.delivery_charge_label,
    discount_percent: s.discount_enabled ? Number(s.discount_percent) || 0 : 0, discount_label: s.discount_label,
    tax_percent: s.tax_enabled ? Number(s.tax_percent) || 0 : 0, tax_label: s.tax_label, time_zone: s.time_zone,
  }
  const example = computeQuote(new Date(0), new Date(8.5 * 3600_000), 2500, 2.5, pricing)

  const save = async () => {
    setSaving(true); setSaveError(null)
    try {
      const { updated_at: _u, ...rest } = s
      void _u
      setS(await adminApi.updateSettings(token, rest))
      setToast('Settings saved. New bookings use them from now on.')
      void reloadPublic()
    } catch (e) { setSaveError((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Settings" description="Business details, pricing rules and admin security." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Business and contact" description="Shown on the website header, footer, contact sections and receipts.">
            {textField('business_name', 'Business name')}
            {textField('tagline', 'Homepage supporting text')}
            <div className="grid gap-4 sm:grid-cols-2">
              {textField('contact_phone', 'Phone', { type: 'tel' })}
              {textField('contact_whatsapp', 'WhatsApp number', { type: 'tel' })}
              {textField('contact_email', 'Email', { type: 'email' })}
              {textField('business_hours', 'Business hours', { placeholder: 'Open 24 hours, 7 days' })}
            </div>
            <div>
              <label htmlFor="s-contact_address" className="field-label">Address</label>
              <textarea id="s-contact_address" rows={2} className="input" value={s.contact_address ?? ''} onChange={(e) => set('contact_address', e.target.value)} />
            </div>
          </Section>

          <Section title="Billing rules" description="Hourly rates are set per generator on the Generators page.">
            <div>
              <label htmlFor="s-billing_mode" className="field-label">How rental time is charged</label>
              <select id="s-billing_mode" className="input" value={s.billing_mode} onChange={(e) => set('billing_mode', e.target.value as AdminSettings['billing_mode'])}>
                {Object.entries(BILLING_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {numField('minimum_billable_hours', 'Minimum hours charged', 'Set to 0 for no minimum.', '0.5')}
          </Section>

          <Section title="Optional charges" description="Everything here starts switched off. Anything you switch on is shown line by line to customers and on receipts.">
            <div className="space-y-3 rounded-[4px] border border-line p-4">
              {toggle('delivery_charge_enabled', 'Charge for delivery')}
              {s.delivery_charge_enabled && <div className="grid gap-4 sm:grid-cols-2">{numField('delivery_charge', 'Amount per booking (₹)')}{textField('delivery_charge_label', 'Label on receipt')}</div>}
            </div>
            <div className="space-y-3 rounded-[4px] border border-line p-4">
              {toggle('discount_enabled', 'Give a discount')}
              {s.discount_enabled && <div className="grid gap-4 sm:grid-cols-2">{numField('discount_percent', 'Discount (%)', undefined, '0.5')}{textField('discount_label', 'Label on receipt')}</div>}
            </div>
            <div className="space-y-3 rounded-[4px] border border-line p-4">
              {toggle('tax_enabled', 'Add tax')}
              {s.tax_enabled && <div className="grid gap-4 sm:grid-cols-2">{numField('tax_percent', 'Tax rate (%)', 'Applied after any discount.', '0.5')}{textField('tax_label', 'Label on receipt', { placeholder: 'GST' })}</div>}
            </div>
          </Section>

          <Section title="Booking rules">
            <div>
              <label htmlFor="s-time_zone" className="field-label">Business time zone</label>
              <select id="s-time_zone" className="input" value={s.time_zone} onChange={(e) => set('time_zone', e.target.value)}>
                {[...new Set([s.time_zone, ...TIME_ZONES])].map((z) => <option key={z} value={z}>{z === 'Asia/Kolkata' ? 'Asia/Kolkata (IST)' : z}</option>)}
              </select>
              <p className="field-hint">Customers enter rental times in this time zone, and receipts show it.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {numField('min_lead_minutes', 'Minimum notice (minutes)', 'How far ahead a rental must start. 0 allows immediate bookings.')}
              {numField('max_booking_days', 'Longest booking (days)')}
            </div>
          </Section>

          <Section title="Admin security" description="A four-digit PIN is a convenience for a small business. Keep it private and change it if you think someone has seen it.">
            {numField('admin_session_timeout_minutes', 'Sign out after inactivity (minutes)', 'Between 5 and 480 minutes.')}
            <div className="border-t border-line pt-5">
              <h3 className="mb-3 font-semibold">Change PIN</h3>
              <ChangePin />
            </div>
          </Section>
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <div className="panel p-5">
            <h2 className="font-bold">Example with these rules</h2>
            <p className="mb-3 text-sm text-steel">25 kVA at ₹2,500/hour for 8 hours 30 minutes.</p>
            <PriceBreakdown quote={example} pricing={pricing} capacityKva={25} />
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:left-[240px]">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          {saveError && <p className="mr-auto text-sm font-medium text-busy" role="alert">{saveError}</p>}
          <button type="button" className="btn-ghost" onClick={() => data && setS(data)} disabled={saving}>Discard changes</button>
          <button type="button" className="btn-amber" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
