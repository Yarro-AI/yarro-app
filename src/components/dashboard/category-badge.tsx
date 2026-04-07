import { cn } from '@/lib/utils'
import { Wrench, ShieldCheck, DollarSign } from 'lucide-react'
import type { Urgency, JobCategory } from './todo-panel'

const CATEGORY_BG: Record<JobCategory, string> = {
  maintenance: 'bg-primary',
  compliance:  'bg-warning',
  finance:     'bg-success',
}

const CATEGORY_ICON = {
  maintenance: Wrench,
  compliance:  ShieldCheck,
  finance:     DollarSign,
} as const

const METER_CONFIG: Record<Urgency, { count: number; color: string }> = {
  low:       { count: 1, color: 'bg-success' },
  medium:    { count: 2, color: 'bg-[#EAB308]' },
  high:      { count: 3, color: 'bg-[#F97316]' },
  urgent:    { count: 4, color: 'bg-danger' },
  emergency: { count: 4, color: 'bg-danger' },
}

interface CategoryBadgeProps {
  category: JobCategory
  urgency: Urgency
}

export function CategoryBadge({ category, urgency }: CategoryBadgeProps) {
  const Icon = CATEGORY_ICON[category]
  const meter = METER_CONFIG[urgency]

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      {/* Priority meter — 4 dots stacked vertically */}
      <div className="flex flex-col-reverse gap-[3px]">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              i < meter.count ? meter.color : 'bg-[#E5E7EB]',
            )}
          />
        ))}
      </div>
      {/* Category icon */}
      <div
        className={cn(
          'w-12 h-12 rounded-lg flex items-center justify-center',
          CATEGORY_BG[category],
        )}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  )
}
