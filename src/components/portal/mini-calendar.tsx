'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type MiniCalendarProps = {
  selected: string
  onSelect: (dateStr: string) => void
  minDate: Date
  isDateDisabled?: (dateStr: string) => boolean
}

export function MiniCalendar({ selected, onSelect, minDate, isDateDisabled }: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(() => {
    if (selected) return new Date(selected + 'T00:00:00')
    return new Date()
  })

  // Clone minDate to avoid mutating the prop
  const normalizedMin = new Date(minDate)
  normalizedMin.setHours(0, 0, 0, 0)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay + 6) % 7

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const monthLabel = new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const canGoPrev = new Date(year, month, 1) > normalizedMin

  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => canGoPrev && setViewDate(new Date(year, month - 1, 1))}
          className={`p-1.5 rounded-lg transition-colors ${canGoPrev ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-200 cursor-default'}`}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <div key={d} className="text-[10px] font-medium text-gray-400 pb-1.5">{d}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />
          const date = new Date(year, month, day)
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isPast = date < normalizedMin
          const disabled = isPast || (isDateDisabled ? isDateDisabled(dateStr) : false)
          const isSelected = selected === dateStr
          const isToday = date.getTime() === today.getTime()

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(dateStr)}
              className={`h-9 w-full rounded-lg text-sm transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white font-semibold'
                  : disabled
                    ? 'text-gray-200 cursor-default'
                    : isToday
                      ? 'bg-blue-50 text-blue-700 font-medium hover:bg-blue-100'
                      : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
