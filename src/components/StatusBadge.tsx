import { CircleCheck, CircleDot, CircleSlash, Clock, Wrench, CircleX, Flag } from 'lucide-react'
import type { Availability, BookingStatus } from '../lib/types'

const AVAILABILITY = {
  available: { label: 'Available', cls: 'bg-ok-soft text-ok', Icon: CircleCheck },
  booked: { label: 'Booked for selected period', cls: 'bg-busy-soft text-busy', Icon: Clock },
  unavailable: { label: 'Unavailable', cls: 'bg-hold-soft text-hold', Icon: Wrench },
  inactive: { label: 'Inactive', cls: 'bg-concrete text-steel', Icon: CircleSlash },
} as const

export function AvailabilityBadge({ value }: { value: Availability }) {
  const { label, cls, Icon } = AVAILABILITY[value]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${cls}`}>
      <Icon size={15} aria-hidden /> {label}
    </span>
  )
}

const STATUS = {
  confirmed: { label: 'Confirmed', cls: 'bg-amber-soft text-amber-ink', Icon: CircleCheck },
  ongoing: { label: 'Ongoing', cls: 'bg-ok-soft text-ok', Icon: CircleDot },
  completed: { label: 'Completed', cls: 'bg-concrete text-iron', Icon: Flag },
  cancelled: { label: 'Cancelled', cls: 'bg-busy-soft text-busy', Icon: CircleX },
} as const

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed', ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled',
}

export function StatusBadge({ value, size = 'md' }: { value: BookingStatus; size?: 'sm' | 'md' }) {
  const { label, cls, Icon } = STATUS[value]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${cls} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]'}`}>
      <Icon size={size === 'sm' ? 12 : 14} aria-hidden /> {label}
    </span>
  )
}

export const STATUS_BAR: Record<BookingStatus, string> = {
  confirmed: 'bg-amber-soft border-l-4 border-amber text-ink',
  ongoing: 'bg-ok-soft border-l-4 border-ok text-ink',
  completed: 'bg-concrete border-l-4 border-steel text-iron',
  cancelled: 'bg-busy-soft/60 border-l-4 border-busy text-busy line-through decoration-busy/40',
}
