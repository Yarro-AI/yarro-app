'use client'

import { useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { differenceInDays, differenceInHours } from 'date-fns'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import { StatCard } from './stat-card'
import { StatusBadge } from '@/components/status-badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { TodoItem } from '@/components/dashboard/todo-panel'

interface WaitingSectionProps {
  waitingItems: TodoItem[]
  stuckItems: TodoItem[]
  onTicketClick: (item: TodoItem) => void
}

// ─── Wait duration pill (matches SlaBadge visual pattern) ────────────────────

function WaitDurationBadge({ waitingSince }: { waitingSince: string }) {
  const hours = differenceInHours(new Date(), new Date(waitingSince))
  const days = Math.floor(hours / 24)

  let label: string
  if (hours < 24) label = `${hours}h`
  else if (days === 1) label = '1d'
  else label = `${days}d`

  let style: string
  if (days >= 5) style = 'bg-danger/10 text-danger font-semibold'
  else if (days >= 3) style = 'bg-warning/10 text-warning font-medium'
  else style = 'bg-muted text-muted-foreground'

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs whitespace-nowrap flex-shrink-0',
      style,
    )}>
      {label}
    </span>
  )
}

// ─── Grouping logic ──────────────────────────────────────────────────────────

interface Group { key: string; label: string; items: TodoItem[] }

function groupWaitingItems(items: TodoItem[]): Group[] {
  const contractors: TodoItem[] = []
  const landlords: TodoItem[] = []
  const ooh: TodoItem[] = []

  for (const item of items) {
    const r = item.next_action_reason
    if (r === 'awaiting_contractor' || r === 'awaiting_booking') contractors.push(item)
    else if (r === 'awaiting_landlord' || r === 'allocated_to_landlord' || r === 'landlord_in_progress') landlords.push(item)
    else if (r === 'ooh_in_progress') ooh.push(item)
    else contractors.push(item) // fallback
  }

  return [
    { key: 'contractors', label: 'Contractors', items: contractors },
    { key: 'landlords', label: 'Landlords', items: landlords },
    { key: 'ooh', label: 'OOH', items: ooh },
  ].filter(g => g.items.length > 0)
}

const BLOCKED_REASONS = new Set([
  'landlord_declined', 'landlord_needs_help', 'ooh_unresolved', 'job_not_completed',
])

function groupStuckItems(items: TodoItem[]): Group[] {
  const unresponsive: TodoItem[] = []
  const blocked: TodoItem[] = []
  const noResponse: TodoItem[] = []
  const overdue: TodoItem[] = []

  for (const item of items) {
    if (item.action_type === 'CONTRACTOR_UNRESPONSIVE') unresponsive.push(item)
    else if (item.action_type === 'SCHEDULED_OVERDUE') overdue.push(item)
    else if (BLOCKED_REASONS.has(item.next_action_reason || '')) blocked.push(item)
    else noResponse.push(item)
  }

  return [
    { key: 'unresponsive', label: 'Unresponsive contractor', items: unresponsive },
    { key: 'blocked', label: 'Blocked', items: blocked },
    { key: 'no-response', label: 'No response', items: noResponse },
    { key: 'overdue', label: 'Overdue', items: overdue },
  ].filter(g => g.items.length > 0)
}

function sortByWaitingSince(items: TodoItem[]) {
  return [...items].sort(
    (a, b) => new Date(a.waiting_since).getTime() - new Date(b.waiting_since).getTime()
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WaitingSection({ waitingItems, stuckItems, onTicketClick }: WaitingSectionProps) {
  const [modalType, setModalType] = useState<'waiting' | 'stuck' | null>(null)

  const activeItems = modalType === 'waiting' ? waitingItems : stuckItems
  const groups = modalType === 'waiting'
    ? groupWaitingItems(activeItems)
    : groupStuckItems(activeItems)

  const hasStuck = stuckItems.length > 0
  const accentBorder = modalType === 'stuck' ? 'border-danger/40' : 'border-primary/40'

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Waiting"
          value={waitingItems.length}
          icon={Clock}
          accentColor="primary"
          onClick={() => setModalType('waiting')}
        />
        <StatCard
          label="Stuck"
          value={stuckItems.length}
          icon={AlertTriangle}
          accentColor={hasStuck ? 'danger' : 'muted'}
          subtitle={hasStuck ? `${stuckItems.length} need attention` : undefined}
          onClick={() => setModalType('stuck')}
        />
      </div>

      {/* Breakdown modal */}
      <Dialog open={!!modalType} onOpenChange={(open) => !open && setModalType(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {modalType === 'waiting' ? 'Waiting' : 'Stuck'}
            </DialogTitle>
            <DialogDescription>
              {modalType === 'waiting'
                ? `${activeItems.length} job${activeItems.length !== 1 ? 's' : ''} waiting for a response`
                : `${activeItems.length} job${activeItems.length !== 1 ? 's' : ''} stalled — need a push`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {activeItems.length === 0 ? (
              <p className={cn(typography.bodyText, 'text-center py-8')}>
                {modalType === 'waiting' ? 'Nothing waiting' : 'Nothing stuck'}
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map(group => (
                  <div key={group.key}>
                    {/* Group subheader — pronounced, no counter */}
                    {groups.length > 1 && (
                      <div className={cn('flex items-center gap-2 pl-3 border-l-2 mb-3', accentBorder)}>
                        <span className={typography.cardTitle}>{group.label}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      {sortByWaitingSince(group.items).map(item => (
                        <button
                          key={item.id}
                          onClick={() => { onTicketClick(item); setModalType(null) }}
                          className="flex items-start gap-3 py-3 px-3 text-left hover:bg-muted/30 rounded-lg transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <p className={cn(typography.dataLabel, 'truncate')}>{item.issue_summary}</p>
                            <p className={cn(typography.metaText, 'truncate mt-0.5')}>{item.property_label}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {item.next_action_reason && (
                                <StatusBadge status={item.next_action_reason} size="sm" />
                              )}
                            </div>
                            {item.action_context && (
                              <p className={cn(typography.microText, 'mt-1')}>{item.action_context}</p>
                            )}
                          </div>
                          <WaitDurationBadge waitingSince={item.waiting_since} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
