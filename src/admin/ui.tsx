import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

export function PageHeader({ title, children, description }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-wide text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-steel">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

/** Side sheet for record details and edit forms. */
export function Drawer({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEscape(open, onClose)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) panel.current?.focus() }, [open])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`absolute inset-y-0 right-0 flex w-full flex-col bg-paper shadow-2xl focus:outline-none ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.22 }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold">{title}</h2>
              <button type="button" onClick={onClose} className="rounded p-2 text-steel hover:text-ink" aria-label="Close"><X /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger = false, busy = false, onConfirm, onCancel, children }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean
  onConfirm: () => void; onCancel: () => void; children?: ReactNode
}) {
  useEscape(open, onCancel)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (open) cancel.current?.focus() }, [open])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div className="absolute inset-0 bg-ink/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} />
          <motion.div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
            className="relative w-full max-w-md rounded-[6px] bg-paper p-6 shadow-2xl"
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.18 }}>
            <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
            <div className="mt-2 text-[15px] text-steel">{body}</div>
            {children}
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancel} type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Keep as is</button>
              <button type="button" className={danger ? 'btn-danger' : 'btn-amber'} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [message, onDone])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {message && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="pointer-events-auto rounded-[4px] bg-ink px-4 py-3 text-[15px] font-medium text-white shadow-lg">
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-steel">{label}</p>
      <p className="font-wide mt-1 text-2xl font-black tabular">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-steel">{hint}</p>}
    </div>
  )
}
