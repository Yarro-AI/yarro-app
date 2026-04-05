'use client'

import { useState, useCallback, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTITY_CONFIGS, type EntityType, type ColumnDef } from '@/lib/bulk-import/config'
import { PREVIEW_ROWS, type ValidatedRow, type ColumnMatch, type MergeInfo } from '@/lib/bulk-import/pipeline'

interface PreviewTableProps {
  rows: ValidatedRow[]
  entityType: EntityType
  matches: ColumnMatch[]
  merges: MergeInfo[]
  sourceHeaders: string[]
  skippedHeaders: string[]
  onEdit: (rowIndex: number, field: string, value: string) => void
  onColumnChange: (targetColumn: string, sourceIndex: number | null) => void
}

export function PreviewTable({
  rows,
  entityType,
  matches,
  merges,
  sourceHeaders,
  skippedHeaders,
  onEdit,
  onColumnChange,
}: PreviewTableProps) {
  const config = ENTITY_CONFIGS[entityType]
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null)

  // Which targets are mapped?
  const mappedTargets = useMemo(() => {
    const mapped = new Set<string>()
    matches.forEach((m) => {
      if (m.targetColumn && !m.needsReview && m.confidence !== 'unmatched') mapped.add(m.targetColumn)
    })
    merges.forEach((m) => mapped.add(m.rule.targetColumn))
    return mapped
  }, [matches, merges])

  // Sort columns: mapped first, then unmapped
  const sortedColumns = useMemo(() => {
    const mapped = config.columns.filter((c) => mappedTargets.has(c.key))
    const unmapped = config.columns.filter((c) => !mappedTargets.has(c.key))
    return [...mapped, ...unmapped]
  }, [config.columns, mappedTargets])

  // Find source index for a target
  const getSourceForTarget = (targetKey: string): number | null => {
    const idx = matches.findIndex((m) => m.targetColumn === targetKey && m.confidence !== 'merge' && m.confidence !== 'unmatched')
    return idx >= 0 ? idx : null
  }

  const visibleRows = rows.slice(0, PREVIEW_ROWS)
  const validCount = rows.filter((r) => Object.keys(r.errors).length === 0).length
  const warningCount = rows.filter(
    (r) => Object.keys(r.errors).length === 0 && Object.keys(r.warnings).length > 0
  ).length
  const errorCount = rows.filter((r) => Object.keys(r.errors).length > 0).length

  const missingRequired = config.columns.filter(
    (c) => c.required && !mappedTargets.has(c.key)
  )

  const handleBlur = useCallback(
    (rowIndex: number, field: string, value: string) => {
      onEdit(rowIndex, field, value)
      setEditingCell(null)
    },
    [onEdit]
  )

  return (
    <div className="space-y-3">
      {/* Info banners */}
      {merges.length > 0 && (
        <div className="space-y-1">
          {merges.map((merge, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/30 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 flex-shrink-0" />
              {merge.rule.label}
            </div>
          ))}
        </div>
      )}

      {skippedHeaders.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {skippedHeaders.length} CSV column{skippedHeaders.length !== 1 ? 's' : ''} not mapped: {skippedHeaders.join(', ')}
        </div>
      )}

      {missingRequired.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
          Missing required: {missingRequired.map((c) => c.label).join(', ')}
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1 text-emerald-600">
          <CheckCircle2 className="h-3 w-3" /> {validCount} valid
        </span>
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3 w-3" /> {warningCount} warnings
          </span>
        )}
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <XCircle className="h-3 w-3" /> {errorCount} errors
          </span>
        )}
        {rows.length > PREVIEW_ROWS && (
          <span className="text-muted-foreground ml-auto">
            Showing {PREVIEW_ROWS} of {rows.length}
          </span>
        )}
      </div>

      {/* Table — simple spreadsheet: headers + data */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">#</th>
              {sortedColumns.map((col) => {
                const isMapped = mappedTargets.has(col.key)
                const sourceIdx = getSourceForTarget(col.key)

                return (
                  <th key={col.key} className={cn('px-1 py-1 text-left min-w-[120px]', !isMapped && 'opacity-50')}>
                    <Select
                      value={sourceIdx !== null ? String(sourceIdx) : '__none__'}
                      onValueChange={(val) => {
                        onColumnChange(col.key, val === '__none__' ? null : parseInt(val, 10))
                      }}
                    >
                      <SelectTrigger className={cn(
                        'h-auto border-0 bg-transparent shadow-none px-2 py-1 text-xs font-medium hover:bg-muted/80',
                        !isMapped && 'text-muted-foreground'
                      )}>
                        <span className="truncate">
                          {col.label}
                          {col.required && <span className="text-destructive ml-0.5">*</span>}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground">Not mapped</span>
                        </SelectItem>
                        {sourceHeaders.map((header, idx) => {
                          const match = matches[idx]
                          const mappedTo = match?.targetColumn && match.confidence !== 'unmatched' ? match.targetColumn : null
                          const isUsedElsewhere = mappedTo && mappedTo !== col.key
                          const usedByLabel = isUsedElsewhere
                            ? config.columns.find((c) => c.key === mappedTo)?.label
                            : null

                          return (
                            <SelectItem key={idx} value={String(idx)} disabled={!!isUsedElsewhere}>
                              {header}
                              {isUsedElsewhere && (
                                <span className="text-muted-foreground ml-1 text-[10px]">(→ {usedByLabel})</span>
                              )}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </th>
                )
              })}
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.map((row, rowIdx) => {
              const hasErrors = Object.keys(row.errors).length > 0
              const hasWarnings = Object.keys(row.warnings).length > 0

              return (
                <tr key={rowIdx} className={cn(hasErrors && 'bg-destructive/5')}>
                  <td className="px-3 py-1.5 text-muted-foreground">{rowIdx + 1}</td>
                  {sortedColumns.map((col) => {
                    const value = row.data[col.key] || ''
                    const error = row.errors[col.key]
                    const warning = row.warnings[col.key]
                    const isMapped = mappedTargets.has(col.key)
                    const isEditing = editingCell?.row === rowIdx && editingCell?.col === col.key

                    return (
                      <td
                        key={col.key}
                        className={cn(
                          'px-3 py-1.5',
                          error && 'ring-1 ring-inset ring-destructive/50',
                          !error && warning && 'ring-1 ring-inset ring-amber-500/50',
                          !isMapped && 'opacity-40'
                        )}
                        title={error || warning || undefined}
                        onClick={() => isMapped && setEditingCell({ row: rowIdx, col: col.key })}
                      >
                        {isEditing ? (
                          <Input
                            autoFocus
                            defaultValue={value}
                            className="h-6 text-xs px-1"
                            onBlur={(e) => handleBlur(rowIdx, col.key, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleBlur(rowIdx, col.key, (e.target as HTMLInputElement).value)
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                          />
                        ) : (
                          <span className={cn('cursor-default', !value && 'text-muted-foreground italic', isMapped && value && 'cursor-text')}>
                            {value || '—'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5">
                    {hasErrors ? (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    ) : hasWarnings ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
