import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { ErrorNote, Spinner } from '../components/Spinner'
import { api } from '../lib/api'
import { normalizeMobile } from '../lib/validation'

export default function MyBooking() {
  const [reference, setReference] = useState('')
  const [mobile, setMobile] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!reference.trim()) return setError('Enter your booking reference, for example GR261026-AB2CD.')
    if (!normalizeMobile(mobile)) return setError('Enter the 10-digit mobile number you booked with.')
    setBusy(true)
    try {
      const r = await api.findBooking(reference, mobile)
      if (!r) return setError('No booking matches that reference and mobile number. Check both and try again.')
      navigate(`/booking/${r.booking_reference}?t=${r.receipt_token}`, { state: { receipt: r } })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <h1 className="font-wide text-3xl font-extrabold">Find my booking</h1>
      <p className="mt-2 text-steel">Enter the booking reference from your receipt and the mobile number you booked with.</p>
      <form onSubmit={submit} className="panel mt-6 space-y-5 p-6" noValidate>
        <div>
          <label htmlFor="ref" className="field-label">Booking reference</label>
          <input id="ref" className="input uppercase" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="GR261026-AB2CD" autoCapitalize="characters" />
        </div>
        <div>
          <label htmlFor="mob" className="field-label">Mobile number</label>
          <input id="mob" className="input" type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" />
        </div>
        {error && <ErrorNote message={error} />}
        <button type="submit" className="btn-amber w-full" disabled={busy}>
          {busy ? <Spinner label="Searching" /> : <Search size={18} aria-hidden />} Show my booking
        </button>
      </form>
    </div>
  )
}
