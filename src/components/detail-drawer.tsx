'use client'

import { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { X, Pencil, Save, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type DetailDrawerProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  width?: 'default' | 'wide' | 'full'
  // Edit mode props
  editable?: boolean
  isEditing?: boolean
  isSaving?: boolean
  onEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  // Delete props
  deletable?: boolean
  onDelete?: () => void
  deleteLabel?: string
  deleteIcon?: ReactNode
}

const widthClasses = {
  default: 'w-[500px] sm:w-[550px]',
  wide: 'w-[600px] sm:w-[700px]',
  full: 'w-[800px] sm:w-[900px]',
}

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'wide',
  editable = false,
  isEditing = false,
  isSaving = false,
  onEdit,
  onSave,
  onCancel,
  deletable = false,
  onDelete,
  deleteLabel = 'Delete',
  deleteIcon,
}: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        className={cn('overflow-hidden p-0 flex flex-col', widthClasses[width])}
        title={title}
        hideCloseButton
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-card border-b px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 -mr-2">
              {deletable && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={onDelete}
                >
                  {deleteIcon || <Trash2 className="h-4 w-4 mr-1.5" />}
                  {deleteIcon && <span className="ml-1.5">{deleteLabel}</span>}
                  {!deleteIcon && deleteLabel}
                </Button>
              )}
              {editable && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-muted-foreground hover:text-foreground"
                  onClick={onEdit}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
              )}
              {isEditing && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3"
                    onClick={onCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <InteractiveHoverButton
                    text={isSaving ? 'Saving...' : 'Save'}
                    onClick={onSave}
                    disabled={isSaving}
                    size="sm"
                  />
                </>
              )}
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

type DetailSectionProps = {
  title?: string
  children: ReactNode
  className?: string
}

export function DetailSection({ title, children, className }: DetailSectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

type DetailRowProps = {
  label: string
  children: ReactNode
  className?: string
}

export function DetailRow({ label, children, className }: DetailRowProps) {
  return (
    <div className={cn('flex justify-between items-start py-2 border-b border-border/50 last:border-0', className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{children}</span>
    </div>
  )
}

type DetailGridProps = {
  children: ReactNode
  columns?: 2 | 3
  className?: string
}

export function DetailGrid({ children, columns = 2, className }: DetailGridProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  )
}

type DetailFieldProps = {
  label: string
  children: ReactNode
  className?: string
}

export function DetailField({ label, children, className }: DetailFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  )
}

type DetailDividerProps = {
  className?: string
}

export function DetailDivider({ className }: DetailDividerProps) {
  return <div className={cn('border-t my-5', className)} />
}
