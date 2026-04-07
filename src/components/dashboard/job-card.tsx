'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { CategoryBadge } from './category-badge'
import { getCtaText, getTodoHref, deriveUrgency, deriveCategory } from './todo-panel'
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
    return (
      <div className="flex-shrink-0" title="SLA breached">
        <AlertTriangle className="w-5 h-5 text-red-500 fill-red-500/20" />
      </div>
    )
  }

  // Countdown ring — fraction remaining out of 24h
  const fraction = Math.max(0, hoursLeft / 24)
  const color = hoursLeft <= 2 ? '#EF4444' : hoursLeft <= 8 ? '#F97316' : '#EAB308'
  const radius = 8
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - fraction)

  return (
    <div className="flex-shrink-0" title={`SLA: ${Math.ceil(hoursLeft)}h remaining`}>
      <svg width="20" height="20" viewBox="0 0 20 20">
        {/* Background track */}
        <circle cx="10" cy="10" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="2.5" />
        {/* Countdown arc */}
        <circle
          cx="10" cy="10" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 10 10)"
        />
      </svg>
    </div>
  )
}

export function JobCard({ item, onHandoffClick, onTicketClick }: JobCardProps) {
  const href = getTodoHref(item)
  const ctaText = getCtaText(item)
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
    'flex items-center p-5 rounded-xl border',
    'transition-all duration-150 cursor-pointer group',
    'hover:-translate-y-0.5 hover:shadow-sm',
    isEmergency
      ? 'bg-danger/5 border-danger/20 hover:border-danger/30'
      : 'bg-white border-[#F3F4F6]',
  )

  const content = (
    <>
      {/* Left section: priority meter + badge + divider */}
      <div className="flex items-center pr-5 mr-5 border-r-2 border-[#F3F4F6] self-stretch">
        <CategoryBadge category={category} urgency={urgency} />
      </div>
      {/* Right section: text content */}
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-[#111827] truncate">{item.issue_summary}</p>
        <p className="text-sm text-[#6B7280] truncate mt-0.5">{item.property_label}</p>
      </div>
      {item.sla_due_at && <SlaRing slaDueAt={item.sla_due_at} />}
      <Button
        variant="default"
        size="sm"
        className={cn(
          'flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity',
        )}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          handleClick()
        }}
      >
        {ctaText}
      </Button>
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
