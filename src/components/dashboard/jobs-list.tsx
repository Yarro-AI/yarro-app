'use client'

import { JobCard } from './job-card'
import type { TodoItem } from './todo-panel'

interface JobsListProps {
  items: TodoItem[]
  onHandoffClick: (item: TodoItem) => void
  onTicketClick: (item: TodoItem) => void
  scheduledDateMap?: Map<string, string>
}

export function JobsList({ items, onHandoffClick, onTicketClick, scheduledDateMap }: JobsListProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {items.map(item => (
        <JobCard
          key={item.id}
          item={item}
          onHandoffClick={onHandoffClick}
          onTicketClick={onTicketClick}
          scheduledDate={scheduledDateMap?.get(item.ticket_id) ?? null}
        />
      ))}
    </div>
  )
}
