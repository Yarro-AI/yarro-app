// SSOT for rent status badge styling and labels.
// All rent display components import from here — one place to change.
// Pattern: matches REASON_DISPLAY in reason-display.ts.

export const RENT_STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  paid:     { label: 'Paid',               className: 'bg-emerald-500/10 text-emerald-600' },
  overdue:  { label: 'Overdue',            className: 'bg-red-500/10 text-red-600' },
  arrears:  { label: 'Arrears',            className: 'bg-red-500/10 text-red-600' },
  partial:  { label: 'Owing',              className: 'bg-amber-500/10 text-amber-600' },
  pending:  { label: 'Pending',            className: 'bg-muted text-muted-foreground' },
  vacant:   { label: 'Vacant',             className: 'text-muted-foreground/50 italic' },
  no_entry: { label: 'No rent configured', className: 'text-muted-foreground/50' },
}

const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium'

export function getRentStatusStyle(status: string): string {
  const entry = RENT_STATUS_DISPLAY[status]
  return `${BADGE_BASE} ${entry?.className ?? RENT_STATUS_DISPLAY.pending.className}`
}

export function getRentStatusLabel(status: string): string {
  return RENT_STATUS_DISPLAY[status]?.label ?? status
}
