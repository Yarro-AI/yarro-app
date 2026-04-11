import { AlertTriangle } from 'lucide-react'

interface SlaRingProps {
  slaDueAt: string
  slaTotalHours: number | null
}

/** Circular SLA countdown — proportional to each ticket's own SLA window */
export function SlaRing({ slaDueAt, slaTotalHours }: SlaRingProps) {
  const hoursLeft = (new Date(slaDueAt).getTime() - Date.now()) / 3_600_000
  const totalHours = slaTotalHours || 24

  // Breached — red warning triangle
  if (hoursLeft <= 0) {
    return <AlertTriangle className="w-6 h-6 text-red-500 fill-red-500/20" />
  }

  // Countdown ring — fraction remaining out of this ticket's SLA window
  const fraction = Math.min(1, Math.max(0, hoursLeft / totalHours))
  const color = fraction <= 0.10 ? '#EF4444' : fraction <= 0.33 ? '#F97316' : '#EAB308'
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - fraction)

  const ariaLabel = hoursLeft >= 48
    ? `SLA: ${Math.ceil(hoursLeft / 24)}d remaining`
    : `SLA: ${Math.ceil(hoursLeft)}h remaining`

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-label={ariaLabel}>
      <circle cx="14" cy="14" r={radius} fill="none" className="stroke-border" strokeWidth="2.5" />
      <circle
        cx="14" cy="14" r={radius}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 14 14)"
      />
    </svg>
  )
}

/** Format SLA remaining time as human-readable text */
export function formatSlaRemaining(slaDueAt: string): { text: string; color: string; breached: boolean } {
  const msLeft = new Date(slaDueAt).getTime() - Date.now()

  if (msLeft <= 0) {
    const hoursAgo = Math.abs(msLeft) / 3_600_000
    const text = hoursAgo >= 24
      ? `Breached ${Math.round(hoursAgo / 24)}d ago`
      : `Breached ${Math.round(hoursAgo)}h ago`
    return { text, color: 'text-red-500', breached: true }
  }

  const hours = msLeft / 3_600_000
  if (hours >= 48) {
    return { text: `Due in ${Math.round(hours / 24)}d`, color: 'text-yellow-600', breached: false }
  }
  if (hours >= 1) {
    return { text: `Due in ${Math.round(hours)}h`, color: 'text-orange-500', breached: false }
  }
  const mins = Math.round(msLeft / 60_000)
  return { text: `Due in ${mins}m`, color: 'text-red-500', breached: false }
}
