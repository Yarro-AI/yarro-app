'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { CategoryBadge } from './category-badge'
import { getTodoHref, deriveUrgency, deriveCategory } from './todo-panel'
import type { TodoItem } from './todo-panel'

interface JobCardProps {
  item: TodoItem
  onHandoffClick: (item: TodoItem) => void
  onTicketClick: (item: TodoItem) => void
}

/** Circular SLA countdown — only visible when <=24h remain */
function SlaRing({ slaDueAt }: { slaDueAt: string }) {
  const hoursLeft = (new Date(slaDueAt).getTime() - Date.now()) / 3_600_000
  if (hoursLeft > 24) return null

  // Breached — red warning triangle
  if (hoursLeft <= 0) {
    return <AlertTriangle className="w-6 h-6 text-red-500 fill-red-500/20" />
  }

  // Countdown ring — fraction remaining out of 24h
  const fraction = Math.max(0, hoursLeft / 24)
  const color = hoursLeft <= 2 ? '#EF4444' : hoursLeft <= 8 ? '#F97316' : '#EAB308'
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - fraction)

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-label={`SLA: ${Math.ceil(hoursLeft)}h remaining`}>
      <circle cx="14" cy="14" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="2.5" />
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

export function JobCard({ item, onHandoffClick, onTicketClick }: JobCardProps) {
  const href = getTodoHref(item)
  const urgency = deriveUrgency(item)
  const category = deriveCategory(item)
  const src = item.source_type || 'ticket'

  const handleClick = () => {
    if (src === 'handoff') {
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
      : 'bg-white border-[#F3F4F6]',
  )

  const content = (
    <>
      {/* Col 1: Category badge + urgency meter */}
      <div className="flex items-center pr-3 border-r-2 border-[#F3F4F6] self-stretch">
        <CategoryBadge category={category} urgency={urgency} />
      </div>
      {/* Col 2: Issue + property (truncates) */}
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-[#111827] truncate">{item.issue_summary}</p>
        <p className="text-sm text-[#6B7280] truncate mt-0.5">{item.property_label}</p>
      </div>
      {/* Col 3: SLA ring */}
      <div className="flex items-center justify-center">
        {item.sla_due_at ? (
          <SlaRing slaDueAt={item.sla_due_at} />
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
