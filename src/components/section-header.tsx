'use client'

import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  icon: LucideIcon
  iconColor?: string        // Tailwind bg color class like "bg-emerald-500/10"
  iconTextColor?: string    // Tailwind text color class like "text-emerald-600"
  title: string
  description: string
}

export function SectionHeader({
  icon: Icon,
  iconColor = 'bg-primary/10',
  iconTextColor = 'text-primary',
  title,
  description,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('p-2 rounded-lg', iconColor)}>
        <Icon className={cn('h-4 w-4', iconTextColor)} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
