'use client'

import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { TodoRow } from './todo-row'
import type { TodoItem } from './todo-panel'

interface TodoCategoryCardProps {
  icon: LucideIcon
  title: string
  accentColor: string
  items: TodoItem[]
  expanded: boolean
  onToggle: () => void
  onHandoffClick: (item: TodoItem) => void
  onTicketClick: (item: TodoItem) => void
}

export function TodoCategoryCard({
  icon: Icon,
  title,
  accentColor,
  items,
  expanded,
  onToggle,
  onHandoffClick,
  onTicketClick,
}: TodoCategoryCardProps) {
  if (items.length === 0) return null

  const urgentCount = items.filter(i => i.priority === 'Emergency' || i.priority === 'Urgent').length

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
          <div className={`w-8 h-8 rounded-lg ${accentColor} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-foreground">{title}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {urgentCount > 0 && (
              <span className="text-xs font-bold text-danger bg-danger/10 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
                {urgentCount}
              </span>
            )}
            <span className="text-xs text-muted-foreground font-medium">
              {items.length}
            </span>
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y divide-border/40">
          {items.map(item => (
            <TodoRow
              key={item.id}
              item={item}
              onHandoffClick={onHandoffClick}
              onTicketClick={onTicketClick}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
