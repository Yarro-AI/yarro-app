'use client'

import { useState } from 'react'
import { startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'

export type DateRange = {
  from: Date
  to: Date
  label: string
}

type DateFilterProps = {
  value: DateRange
  onChange: (range: DateRange) => void
}

const presets = [
  { label: 'Today', getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: 'Week', getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfDay(new Date()) }) },
  { label: 'Month', getValue: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }) },
  { label: 'Year', getValue: () => ({ from: startOfYear(new Date()), to: endOfDay(new Date()) }) },
  { label: 'All Time', getValue: () => ({ from: new Date(2020, 0, 1), to: endOfDay(new Date()) }) },
]

export function DateFilter({ value, onChange }: DateFilterProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-3 text-sm font-medium rounded-md transition-all',
            value.label === preset.label
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
          )}
          onClick={() => {
            const range = preset.getValue()
            onChange({ ...range, label: preset.label })
          }}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}

export function getDefaultDateRange(): DateRange {
  return {
    from: startOfMonth(new Date()),
    to: new Date(),
    label: 'Month',
  }
}
