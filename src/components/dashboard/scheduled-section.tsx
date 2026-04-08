'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import type { TodoItem } from '@/components/dashboard/todo-panel'

interface ScheduledSectionProps {
  scheduledItems: TodoItem[]
  scheduledDateMap: Map<string, string>
  onTicketClick: (item: TodoItem) => void
}

export function ScheduledSection({ scheduledItems, scheduledDateMap, onTicketClick }: ScheduledSectionProps) {
  // Sort by scheduled date ascending (soonest first)
  const sorted = useMemo(() => {
    return [...scheduledItems].sort((a, b) => {
      const dateA = scheduledDateMap.get(a.ticket_id) || ''
      const dateB = scheduledDateMap.get(b.ticket_id) || ''
      return dateA.localeCompare(dateB)
    })
  }, [scheduledItems, scheduledDateMap])

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0 border-b border-foreground/10">
        <span className="text-base font-semibold text-foreground">Scheduled</span>
        {sorted.length > 0 && (
          <span className="text-xs font-bold text-success bg-success/10 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
            {sorted.length}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">No scheduled jobs</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/30">
            {sorted.map(item => {
              const dateStr = scheduledDateMap.get(item.ticket_id)
              return (
                <button
                  key={item.id}
                  onClick={() => onTicketClick(item)}
                  className="flex items-center justify-between gap-3 py-3 px-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-card-foreground truncate">{item.issue_summary}</p>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{item.property_label}</p>
                  </div>
                  {dateStr && (
                    <span className="text-sm font-medium text-success whitespace-nowrap flex-shrink-0">
                      {format(new Date(dateStr), 'd MMM')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
