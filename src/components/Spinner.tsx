import { LoaderCircle } from 'lucide-react'

export function Spinner({ label = 'Loading', size = 18, className = '' }: { label?: string; size?: number; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 ${className}`}>
      <LoaderCircle size={size} className="animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-steel">
      <LoaderCircle size={22} className="animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[4px] border border-busy/30 bg-busy-soft px-4 py-3 text-[15px] text-busy">
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-3 font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  )
}
