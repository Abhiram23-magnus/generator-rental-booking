import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Download, Home, Printer } from 'lucide-react'
import { ReceiptView } from '../components/ReceiptView'
import { ErrorNote, LoadingBlock } from '../components/Spinner'
import { api } from '../lib/api'
import { downloadReceipt } from '../lib/download-receipt'
import type { Receipt } from '../lib/types'

export default function BookingConfirmed() {
  const { reference = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const location = useLocation()
  const state = location.state as { receipt?: Receipt; justBooked?: boolean } | null
  const [receipt, setReceipt] = useState<Receipt | null>(state?.receipt ?? null)
  const [error, setError] = useState<string | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    // always re-read the saved booking so the receipt reflects what is stored
    api.receipt(reference, token).then(
      (r) => (r ? setReceipt(r) : setError('We could not find this booking. Check the link, or look it up with your booking reference and mobile number.')),
      (e: Error) => !receipt && setError(e.message),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, token])

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {state?.justBooked && (
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="no-print mb-8 flex items-start gap-4 rounded-[6px] border border-ok/30 bg-ok-soft p-5"
          role="status"
        >
          <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden>
            <circle cx="24" cy="24" r="22" fill="#1E7A46" />
            <motion.path d="M14 25l7 7 13-15" fill="none" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.4 }} />
          </svg>
          <div>
            <h1 className="text-xl font-bold text-ok">Your generator booking has been confirmed successfully!</h1>
            <p className="mt-1 text-ink">Save your booking reference. You can open this receipt again from "My booking" with the reference and your mobile number.</p>
          </div>
        </motion.div>
      )}
      {!state?.justBooked && <h1 className="font-wide no-print mb-6 text-3xl font-extrabold">Booking receipt</h1>}

      {error && !receipt && <ErrorNote message={error} />}
      {!receipt && !error && <LoadingBlock label="Loading your receipt" />}

      {receipt && (
        <>
          <ReceiptView r={receipt} />
          <div className="no-print mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-amber" onClick={() => void downloadReceipt(receipt)}>
              <Download size={18} aria-hidden /> Download Receipt as PDF
            </button>
            <button type="button" className="btn-ghost" onClick={() => window.print()}>
              <Printer size={18} aria-hidden /> Print Receipt
            </button>
            <Link to="/" className="btn-ghost">
              <Home size={18} aria-hidden /> Back to Home
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
