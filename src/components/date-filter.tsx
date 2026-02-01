'use client'

import { useState } from 'react'
import { startOfDay, endOfDay, startOfWeek, startOfMonth, startOfYear, format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'
import type { DateRange as DayPickerRange } from 'react-day-picker'

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
  const [open, setOpen] = useState(false)
  const [customRange, setCustomRange] = useState<DayPickerRange | undefined>({
    from: value.from,
    to: value.to,
  })

  const isCustom = !presets.find((p) => p.label === value.label)

  const handleCustomApply = () => {
    if (customRange?.from && customRange?.to) {
      onChange({
        from: startOfDay(customRange.from),
        to: endOfDay(customRange.to),
        label: 'Custom',
      })
      setOpen(false)
    }
  }

  const formatCustomLabel = () => {
    if (isCustom && value.from && value.to) {
      return `${format(value.from, 'dd/MM/yy')} - ${format(value.to, 'dd/MM/yy')}`
    }
    return 'Custom'
  }

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
              ? 'bg-card text-card-foreground shadow-sm'
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

      {/* Custom Date Range */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-3 text-sm font-medium rounded-md transition-all gap-1.5',
              isCustom
                ? 'bg-card text-card-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {formatCustomLabel()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
          <div className="p-3 border-b">
            <p className="text-sm font-medium">Select date range</p>
            <p className="text-xs text-muted-foreground">Pick start and end dates</p>
          </div>
          <Calendar
            mode="range"
            defaultMonth={customRange?.from}
            selected={customRange}
            onSelect={setCustomRange}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
          />
          <div className="p-3 border-t flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCustomApply}
              disabled={!customRange?.from || !customRange?.to}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
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
