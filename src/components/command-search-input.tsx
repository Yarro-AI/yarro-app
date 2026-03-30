'use client'

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type CommandSearchInputProps = {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  blurDelayMs?: number
  className?: string
}

export function CommandSearchInput({
  placeholder = 'Search…',
  value,
  onChange,
  onFocus,
  onBlur,
  blurDelayMs = 0,
  className,
}: CommandSearchInputProps) {
  const [focused, setFocused] = useState(false)

  const handleBlur = () => {
    if (blurDelayMs > 0) {
      setTimeout(() => setFocused(false), blurDelayMs)
    } else {
      setFocused(false)
    }
    onBlur?.()
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 h-9 px-3 rounded-lg border bg-muted transition-all',
        focused ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border',
        className
      )}
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setFocused(true)
          onFocus?.()
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange('')}
          className="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
