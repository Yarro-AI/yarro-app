'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BulkImportFlow } from './bulk-import-flow'
import { ENTITY_CONFIGS, type EntityType } from '@/lib/bulk-import/config'
import type { ImportSummary } from '@/lib/bulk-import/pipeline'

interface BulkImportDialogProps {
  entityType: EntityType
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: (summary: ImportSummary) => void
}

export function BulkImportDialog({ entityType, open, onOpenChange, onComplete }: BulkImportDialogProps) {
  const [importing, setImporting] = useState(false)
  const config = ENTITY_CONFIGS[entityType]

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (importing) return // Prevent dismiss during import
        onOpenChange(val)
      }}
    >
      <DialogContent
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => {
          if (importing) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {entityType === 'unified' ? 'Import Data' : `Import ${config.label}`}
          </DialogTitle>
        </DialogHeader>
        <BulkImportFlow
          entityType={entityType}
          onComplete={(summary) => {
            setImporting(false)
            onComplete?.(summary)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
