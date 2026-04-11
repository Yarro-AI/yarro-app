'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { SlaRing } from './sla-ring'
import { CategoryBadge } from './category-badge'
import { getTodoHref, deriveUrgency, deriveCategory } from './todo-panel'
import type { TodoItem } from './todo-panel'

interface JobCardProps {
  item: TodoItem
  onHandoffClick: (item: TodoItem) => void
  onTicketClick: (item: TodoItem) => void
}

export function JobCard({ item, onHandoffClick, onTicketClick }: JobCardProps) {
  const href = getTodoHref(item)
  const urgency = deriveUrgency(item)
  const category = deriveCategory(item)

  const handleClick = () => {
    if (item.next_action_reason === 'handoff_review') {
      onHandoffClick(item)
      return
    }
    onTicketClick(item)
  }

  const isEmergency = urgency === 'emergency'

  const cardClass = cn(
    'grid grid-cols-[auto_1fr_28px_20px] items-center gap-3 p-4 rounded-xl border',
    'transition-all duration-150 cursor-pointer group',
    'hover:-translate-y-0.5 hover:shadow-sm',
    isEmergency
      ? 'bg-danger/5 border-danger/20 hover:border-danger/30'
      : 'bg-card border-border',
  )

  const content = (
    <>
      {/* Col 1: Category badge + urgency meter */}
      <div className="flex items-center pr-3 border-r-2 border-border self-stretch">
        <CategoryBadge category={category} urgency={urgency} />
      </div>
      {/* Col 2: Issue + property (truncates) */}
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-foreground truncate">{item.issue_summary}</p>
        <p className="text-sm text-muted-foreground truncate mt-0.5">{item.property_label}</p>
      </div>
      {/* Col 3: SLA ring */}
      <div className="flex items-center justify-center">
        {item.sla_due_at ? (
          <SlaRing slaDueAt={item.sla_due_at} slaTotalHours={item.sla_total_hours} />
        ) : null}
      </div>
      {/* Col 4: Arrow (hover reveal) */}
      <ChevronRight className="w-5 h-5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
    </>
  )

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {content}
      </Link>
    )
  }

  return (
    <button onClick={handleClick} className={cn(cardClass, 'w-full text-left')}>
      {content}
    </button>
  )
}
