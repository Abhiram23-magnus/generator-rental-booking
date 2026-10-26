import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Phone } from 'lucide-react'
import { Drawer, ConfirmDialog } from './ui'
import { useAdmin } from './AdminAuth'
import { ReceiptView } from '../components/ReceiptView'
import { STATUS_LABEL, StatusBadge } from '../components/StatusBadge'
import { ErrorNote, LoadingBlock, Spinner } from '../components/Spinner'
import { useSettings } from '../context/SettingsContext'
import { adminApi } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { formatDuration } from '../lib/pricing'
import { downloadReceipt } from '../lib/download-receipt'
import { dateToZonedParts, zonedToDate } from '../lib/time'
import type { AdminBookingDetail, BookingStatus } from '../lib/types'

const NEXT: Record<BookingStatus, BookingStatus[]> = {
  confirmed: ['ongoing', 'completed', 'cancelled'],
  ongoing: ['completed', 'cancelled'],
  cancelled: ['confirmed'],
  completed: [],
}

const ACTION_LABEL: Record<BookingStatus, string> = {
  ongoing: 'Mark as ongoing',
  completed: 'Mark as completed',
  cancelled: 'Cancel booking',
  confirmed: 'Restore booking',
}

export function BookingDrawer({ bookingId, onClose, onChanged }: { bookingId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { token } = useAdmin()
  const { settings } = useSettings()
  const tz = settings.time_zone
  const [b, setB] = useState<AdminBookingDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<BookingStatus | null>(null)
  const [note, setNote] = useState('')
  const [moving, setMoving] = useState<{ sd: string; st: string; ed: string; et: string } | null>(null)

  useEffect(() => {
    if (!bookingId) return
    setB(null); setError(null); setMoving(null)
    adminApi.booking(token, bookingId).then(setB, (e: Error) => setError(e.message))
  }, [bookingId, token])

  const change = async (status: BookingStatus) => {
    if (!b) return
    setBusy(true); setError(null)
    try {
      setB(await adminApi.setBookingStatus(token, b.id, status, note || undefined))
      setConfirm(null); setNote('')
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
      setConfirm(null)
    } finally { setBusy(false) }
  }

  const startMove = () => {
    if (!b) return
    const s = dateToZonedParts(new Date(b.start_at), tz), e = dateToZonedParts(new Date(b.end_at), tz)
    setMoving({ sd: s.date, st: s.time, ed: e.date, et: e.time })
  }

  const saveMove = async () => {
    if (!b || !moving) return
    const start = zonedToDate(moving.sd, moving.st, tz), end = zonedToDate(moving.ed, moving.et, tz)
    if (!start || !end || end <= start) { setError('The new end must be later than the new start.'); return }
    setBusy(true); setError(null)
    try {
      setB(await adminApi.reschedule(token, b.id, start, end))
      setMoving(null)
      onChanged?.()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Drawer open={!!bookingId} onClose={onClose} title={b ? `Booking ${b.booking_reference}` : 'Booking'} wide>
      {!b && !error && <LoadingBlock label="Loading booking" />}
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      {b && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge value={b.status} />
            <span className="text-sm text-steel">{formatDuration(b.duration_seconds)}, from {formatDateTime(b.start_at, tz)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {NEXT[b.status].map((s) => (
              <button key={s} type="button" disabled={busy}
                className={s === 'cancelled' ? 'btn-ghost btn-sm text-busy' : 'btn-ink btn-sm'}
                onClick={() => (s === 'cancelled' || s === 'confirmed' ? setConfirm(s) : change(s))}>
                {ACTION_LABEL[s]}
              </button>
            ))}
            {b.status === 'confirmed' && !moving && <button type="button" className="btn-ghost btn-sm" onClick={startMove}>Change dates</button>}
            <button type="button" className="btn-ghost btn-sm" onClick={() => void downloadReceipt(b)}><Download size={16} aria-hidden /> Receipt PDF</button>
            <a className="btn-ghost btn-sm" href={`tel:+91${b.customer.mobile_number}`}><Phone size={16} aria-hidden /> Call customer</a>
            {busy && <Spinner label="Saving" />}
          </div>

          {moving && (
            <div className="rounded-[4px] border border-line bg-concrete/60 p-4">
              <p className="mb-3 font-semibold">New rental period</p>
              <div className="grid gap-3 sm:grid-cols-4">
                {([['sd', 'Start date', 'date'], ['st', 'Start time', 'time'], ['ed', 'End date', 'date'], ['et', 'End time', 'time']] as const).map(([k, l, type]) => (
                  <label key={k} className="text-sm">
                    <span className="field-label">{l}</span>
                    <input type={type} className="input py-2" value={moving[k]} onChange={(e) => setMoving({ ...moving, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-steel">Charges are recalculated with the hourly rate and rules saved on this booking. Conflicting periods are refused.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn-amber btn-sm" onClick={saveMove} disabled={busy}>Save new dates</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setMoving(null)}>Cancel</button>
              </div>
            </div>
          )}

          <ReceiptView r={b} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to={`/admin/customers?open=${b.customer_id}`} className="font-semibold text-amber-ink underline underline-offset-2">View this customer's bookings</Link>
          </div>

          <section>
            <h3 className="mb-2 font-bold">History</h3>
            <ol className="space-y-2 border-l-2 border-line pl-4">
              {b.events.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="font-semibold">{e.from_status && e.from_status !== e.to_status ? `${STATUS_LABEL[e.from_status]} to ${STATUS_LABEL[e.to_status]}` : e.note ?? STATUS_LABEL[e.to_status]}</span>
                  {e.from_status && e.from_status !== e.to_status && e.note && <span className="text-steel">: {e.note}</span>}
                  <span className="block text-steel">{formatDateTime(e.created_at, tz)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'cancelled' ? 'Cancel this booking?' : 'Restore this booking?'}
        body={confirm === 'cancelled'
          ? 'The generator becomes free for this period and the booking stays in the history as cancelled. It will no longer count towards revenue.'
          : 'The booking becomes confirmed again, if the generator is still free for this period.'}
        confirmLabel={confirm === 'cancelled' ? 'Cancel booking' : 'Restore booking'}
        danger={confirm === 'cancelled'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && change(confirm)}
      >
        <label className="mt-4 block text-sm">
          <span className="field-label">Reason (optional)</span>
          <input className="input py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: customer called to cancel" />
        </label>
      </ConfirmDialog>
    </Drawer>
  )
}
