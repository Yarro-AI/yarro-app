'use client'

import { useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { differenceInDays, differenceInHours } from 'date-fns'
import { cn } from '@/lib/utils'
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

function waitDaysColor(waitingSince: string) {
  const days = differenceInDays(new Date(), new Date(waitingSince))
  if (days >= 5) return 'text-danger'
  if (days >= 3) return 'text-warning'
  return 'text-muted-foreground'
}

function waitLabel(waitingSince: string) {
  const hours = differenceInHours(new Date(), new Date(waitingSince))
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day'
  return `${days} days`
}

// Group items into labelled sections, omitting empty groups
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
    else noResponse.push(item) // landlord_no_response, STALE_AWAITING, fallback
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

export function WaitingSection({ waitingItems, stuckItems, onTicketClick }: WaitingSectionProps) {
  const [modalType, setModalType] = useState<'waiting' | 'stuck' | null>(null)

  const activeItems = modalType === 'waiting' ? waitingItems : stuckItems
  const groups = modalType === 'waiting'
    ? groupWaitingItems(activeItems)
    : groupStuckItems(activeItems)

  const hasStuck = stuckItems.length > 0

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {/* Waiting card */}
        <button
          onClick={() => setModalType('waiting')}
          className={cn(
            'flex flex-col items-center justify-center gap-3 p-6',
            'bg-card border border-border rounded-xl',
            'cursor-pointer transition-all duration-150',
            'hover:-translate-y-1 hover:shadow-md hover:border-primary/20',
            'aspect-square'
          )}
        >
          <Clock className="w-6 h-6 text-primary" />
          <span className="text-sm font-medium text-card-foreground">Waiting</span>
          <span className="text-4xl font-bold text-card-foreground">{waitingItems.length}</span>
        </button>

        {/* Stuck card */}
        <button
          onClick={() => setModalType('stuck')}
          className={cn(
            'flex flex-col items-center justify-center gap-3 p-6',
            'bg-card border border-border rounded-xl',
            'cursor-pointer transition-all duration-150',
            'hover:-translate-y-1 hover:shadow-md hover:border-primary/20',
            'aspect-square'
          )}
        >
          <AlertTriangle className={cn('w-6 h-6', hasStuck ? 'text-danger' : 'text-primary')} />
          <span className="text-sm font-medium text-card-foreground">Stuck</span>
          <span className="text-4xl font-bold text-card-foreground">
            {stuckItems.length}
          </span>
        </button>
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
              <p className="text-sm text-muted-foreground text-center py-8">
                {modalType === 'waiting' ? 'Nothing waiting' : 'Nothing stuck'}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map(group => (
                  <div key={group.key}>
                    {/* Section header — only show if multiple groups */}
                    {groups.length > 1 && (
                      <div className="flex items-center justify-between px-1 pb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.label}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">
                          {group.items.length}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col divide-y divide-border/50">
                      {sortByWaitingSince(group.items).map(item => (
                        <button
                          key={item.id}
                          onClick={() => { onTicketClick(item); setModalType(null) }}
                          className="flex items-start justify-between gap-4 py-3 px-1 text-left hover:bg-muted/30 rounded-lg transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{item.issue_summary}</p>
                            <p className="text-sm text-muted-foreground truncate mt-0.5">{item.property_label}</p>
                            {item.action_context && (
                              <p className="text-xs text-muted-foreground/70 mt-0.5">{item.action_context}</p>
                            )}
                          </div>
                          <span className={cn(
                            'text-sm font-medium whitespace-nowrap flex-shrink-0 pt-0.5',
                            waitDaysColor(item.waiting_since)
                          )}>
                            {waitLabel(item.waiting_since)}
                          </span>
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
