'use client'

import { cn } from '@/lib/utils'
import { formatEventType, formatDate, formatTime } from '@/lib/audit-utils'
import type { UnifiedTimelineEntry } from '@/hooks/use-ticket-audit'

interface AuditTimelineProps {
  timeline: UnifiedTimelineEntry[]
}

function groupByDate(entries: UnifiedTimelineEntry[]): Map<string, UnifiedTimelineEntry[]> {
  const groups = new Map<string, UnifiedTimelineEntry[]>()
  for (const entry of entries) {
    const dateKey = formatDate(entry.timestamp)
    const existing = groups.get(dateKey) || []
    existing.push(entry)
    groups.set(dateKey, existing)
  }
  return groups
}

const eventColors: Record<string, string> = {
  ISSUE_CREATED: 'bg-primary',
  PRIORITY_CLASSIFIED: 'bg-warning',
  PRIORITY_CHANGED: 'bg-warning',
  CONTRACTOR_ASSIGNED: 'bg-blue-500',
  QUOTE_RECEIVED: 'bg-blue-500',
  QUOTE_APPROVED: 'bg-success',
  QUOTE_DECLINED: 'bg-danger',
  JOB_SCHEDULED: 'bg-primary',
  JOB_COMPLETED: 'bg-success',
  TICKET_CLOSED: 'bg-muted-foreground',
  TICKET_ARCHIVED: 'bg-muted-foreground',
  LANDLORD_APPROVED: 'bg-success',
  LANDLORD_DECLINED: 'bg-danger',
  OOH_DISPATCHED: 'bg-warning',
  EMERGENCY_DETECTED: 'bg-danger',
  STATUS_CHANGED: 'bg-muted-foreground',
  HANDOFF_CHANGED: 'bg-warning',
}

export function AuditTimeline({ timeline }: AuditTimelineProps) {
  if (timeline.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No timeline events recorded</p>
      </div>
    )
  }

  const groups = groupByDate(timeline)

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([dateLabel, entries]) => (
        <div key={dateLabel}>
          {/* Date header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {dateLabel}
            </p>
          </div>

          {/* Timeline entries */}
          <div className="relative ml-3">
            {/* Vertical line */}
            <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />

            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="relative pl-6">
                  {/* Node dot */}
                  <div
                    className={cn(
                      'absolute left-0 top-2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-background',
                      eventColors[entry.event_type] || 'bg-muted-foreground'
                    )}
                  />

                  {/* Content */}
                  <div className="bg-card rounded-lg border border-border/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {formatEventType(entry.event_type)}
                      </span>
                      <span className="text-[11px] text-muted-foreground/70 shrink-0">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>

                    {/* Detail */}
                    {entry.detail && (
                      <p className="text-sm text-muted-foreground mt-1">{entry.detail}</p>
                    )}

                    {/* Actor + source */}
                    <div className="flex items-center gap-2 mt-1.5">
                      {entry.actor && (
                        <span className="text-[11px] text-muted-foreground/60">
                          {entry.actor}
                        </span>
                      )}
                      {entry.actor_type && entry.actor_type !== entry.actor && (
                        <span className="text-[10px] text-muted-foreground/40 uppercase">
                          {entry.actor_type}
                        </span>
                      )}
                      {entry.source === 'ledger' && (
                        <span className="text-[10px] text-muted-foreground/30 uppercase">
                          ledger
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
