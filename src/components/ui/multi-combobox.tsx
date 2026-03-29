'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface MultiComboboxOption {
  value: string
  label: string
  description?: string
  badge?: string        // e.g., "Other", "Match"
  badgeVariant?: 'default' | 'secondary' | 'success' | 'warning'
}

interface MultiComboboxProps {
  options: MultiComboboxOption[]
  values: string[]                    // Ordered array of selected values
  onValuesChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  // Add new functionality
  onAddNew?: () => void
  addNewLabel?: string
}

export function MultiCombobox({
  options,
  values,
  onValuesChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  disabled = false,
  className,
  onAddNew,
  addNewLabel = 'Add new',
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedOptions = values
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean) as MultiComboboxOption[]

  const toggleOption = (value: string) => {
    if (values.includes(value)) {
      // Remove from selection
      onValuesChange(values.filter((v) => v !== value))
    } else {
      // Add to end of selection (maintains order)
      onValuesChange([...values, value])
    }
  }

  const removeOption = (value: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onValuesChange(values.filter((v) => v !== value))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal min-h-10 h-auto',
            selectedOptions.length > 0 && 'py-1.5',
            className
          )}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedOptions.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedOptions.map((option, idx) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="text-xs font-normal gap-1"
                >
                  <span className="font-semibold text-primary">{idx + 1}.</span>
                  {option.label}
                  <button
                    type="button"
                    className="ml-0.5 hover:text-destructive"
                    onClick={(e) => removeOption(option.value, e)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {onAddNew && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false)
                    onAddNew()
                  }}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {addNewLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {onAddNew && <CommandSeparator />}
            <CommandGroup>
              {options.map((option) => {
                const isSelected = values.includes(option.value)
                const orderIndex = values.indexOf(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggleOption(option.value)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {isSelected ? (
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {orderIndex + 1}
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <div className="flex flex-col flex-1">
                        <span className={isSelected ? 'font-medium' : ''}>{option.label}</span>
                        {option.description && (
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        )}
                      </div>
                      {option.badge && (
                        <Badge
                          variant={option.badgeVariant === 'success' ? 'default' : 'secondary'}
                          className={cn(
                            'text-xs',
                            option.badgeVariant === 'success' && 'bg-green-100 text-green-700 border-green-200',
                            option.badgeVariant === 'warning' && 'bg-amber-100 text-amber-700 border-amber-200'
                          )}
                        >
                          {option.badge}
                        </Badge>
                      )}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
