'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Upload } from 'lucide-react'
import { ENTITY_CONFIGS, type EntityType } from '@/lib/bulk-import/config'
import {
  detectHasHeaders,
  matchColumns,
  applyMapping,
  normalizeRows,
  validateRows,
  type ColumnMatch,
  type MergeInfo,
  type ValidatedRow,
  type ImportSummary,
} from '@/lib/bulk-import/pipeline'
import { PasteInput } from './paste-input'
import { PreviewTable } from './preview-table'
import { ImportResults } from './import-results'

type Step = 'paste' | 'preview' | 'importing' | 'results'

interface BulkImportFlowProps {
  entityType: EntityType
  onComplete?: (summary: ImportSummary) => void
  onCancel?: () => void
}

export function BulkImportFlow({ entityType, onComplete, onCancel }: BulkImportFlowProps) {
  const supabase = createClient()
  const { propertyManager } = usePM()
  const config = ENTITY_CONFIGS[entityType]

  // State
  const [step, setStep] = useState<Step>('paste')
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [hasHeaders, setHasHeaders] = useState(true)
  const [headerConfidence, setHeaderConfidence] = useState(100)
  const [matches, setMatches] = useState<ColumnMatch[]>([])
  const [merges, setMerges] = useState<MergeInfo[]>([])
  const [skippedHeaders, setSkippedHeaders] = useState<string[]>([])
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([])
  const [normalizedData, setNormalizedData] = useState<Record<string, string>[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  // Derived
  const headers = hasHeaders ? rawRows[0]?.map((h) => h.trim()) || [] : rawRows[0]?.map((_, i) => `Column ${i + 1}`) || []
  const dataRows = hasHeaders ? rawRows.slice(1) : rawRows
  const validCount = validatedRows.filter((r) => Object.keys(r.errors).length === 0).length

  // ── Recompute mapping from current state ──
  const recompute = useCallback(
    (currentMatches: ColumnMatch[], currentMerges: MergeInfo[], currentDataRows: string[][]) => {
      const mapped = applyMapping(currentDataRows, currentMatches, currentMerges)
      const normalized = normalizeRows(mapped, entityType)
      const validated = validateRows(normalized, entityType)
      setNormalizedData(normalized)
      setValidatedRows(validated)
    },
    [entityType]
  )

  // ─── Handlers ──────────────────────────────────────────

  const handleParsed = useCallback(
    (rows: string[][]) => {
      setRawRows(rows)
      const detection = detectHasHeaders(rows, entityType)
      setHasHeaders(detection.hasHeaders)
      setHeaderConfidence(detection.confidence)

      const hdrs = detection.hasHeaders ? rows[0].map((h) => h.trim()) : rows[0].map((_, i) => `Column ${i + 1}`)
      const dRows = detection.hasHeaders ? rows.slice(1) : rows
      const result = matchColumns(hdrs, entityType)
      setMatches(result.matches)
      setMerges(result.merges)
      setSkippedHeaders(result.skippedHeaders)

      // Immediately compute mapped data and show preview
      const mapped = applyMapping(dRows, result.matches, result.merges)
      const normalized = normalizeRows(mapped, entityType)
      const validated = validateRows(normalized, entityType)
      setNormalizedData(normalized)
      setValidatedRows(validated)
      setStep('preview')
    },
    [entityType]
  )

  const handleHeaderToggle = useCallback(
    (checked: boolean) => {
      setHasHeaders(checked)
      const hdrs = checked ? rawRows[0].map((h) => h.trim()) : rawRows[0].map((_, i) => `Column ${i + 1}`)
      const dRows = checked ? rawRows.slice(1) : rawRows
      const result = matchColumns(hdrs, entityType)
      setMatches(result.matches)
      setMerges(result.merges)
      setSkippedHeaders(result.skippedHeaders)
      recompute(result.matches, result.merges, dRows)
    },
    [rawRows, entityType, recompute]
  )

  const handleColumnChange = useCallback(
    (currentTarget: string, newTarget: string | null) => {
      const updated = matches.map((m) => {
        if (m.confidence === 'merge') return m // Don't touch merges

        // Find the source that was mapped to currentTarget and reassign it
        if (m.targetColumn === currentTarget) {
          return {
            ...m,
            targetColumn: newTarget,
            confidence: newTarget ? ('exact' as const) : ('unmatched' as const),
            needsReview: false,
          }
        }
        // If newTarget is already claimed by another source, unclaim it
        if (newTarget && m.targetColumn === newTarget) {
          return { ...m, targetColumn: null, confidence: 'unmatched' as const, needsReview: false }
        }
        return m
      })
      setMatches(updated)

      const newSkipped = updated
        .filter((m) => m.confidence === 'unmatched' && !m.mergedFrom)
        .map((m) => m.sourceHeader)
      setSkippedHeaders(newSkipped)

      recompute(updated, merges, dataRows)
    },
    [matches, merges, dataRows, recompute]
  )

  const handleEdit = useCallback(
    (rowIndex: number, field: string, value: string) => {
      const updated = [...normalizedData]
      updated[rowIndex] = { ...updated[rowIndex], [field]: value }
      setNormalizedData(updated)
      setValidatedRows(validateRows(updated, entityType))
    },
    [normalizedData, entityType]
  )

  const handleImport = useCallback(async () => {
    if (!propertyManager) return
    setStep('importing')

    const rowsToImport = validatedRows
      .filter((r) => Object.keys(r.errors).length === 0)
      .map((r) => r.data)

    if (rowsToImport.length === 0) {
      toast.error('No valid rows to import')
      setStep('preview')
      return
    }

    try {
      const { data, error } = await supabase.rpc(config.rpcName, {
        p_pm_id: propertyManager.id,
        p_data: rowsToImport,
      })

      if (error) {
        toast.error(error.message || 'Import failed')
        setStep('preview')
        return
      }

      const result = data as unknown as ImportSummary
      setSummary(result)
      setStep('results')

      if (result.created > 0) {
        toast.success(`${result.created} ${config.label.toLowerCase()} imported`)
      }

      onComplete?.(result)
    } catch {
      toast.error('Import failed — please try again')
      setStep('preview')
    }
  }, [propertyManager, validatedRows, config, supabase, onComplete])

  const reset = useCallback(() => {
    setStep('paste')
    setRawRows([])
    setMatches([])
    setMerges([])
    setSkippedHeaders([])
    setValidatedRows([])
    setNormalizedData([])
    setSummary(null)
  }, [])

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {(['paste', 'preview', 'results'] as const).map((s, i) => (
          <span key={s} className={step === s || (step === 'importing' && s === 'preview') ? 'text-foreground font-medium' : ''}>
            {i > 0 && <span className="mx-2">→</span>}
            {s === 'paste' ? 'Paste' : s === 'preview' ? 'Preview' : 'Results'}
          </span>
        ))}
      </div>

      {/* Step 1: Paste */}
      {step === 'paste' && (
        <PasteInput
          onParsed={handleParsed}
          onError={(err) => toast.error(err)}
        />
      )}

      {/* Step 2: Preview (combined mapping + preview) */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="has-headers"
              checked={hasHeaders}
              onCheckedChange={(checked) => handleHeaderToggle(checked === true)}
            />
            <label htmlFor="has-headers" className="text-sm">
              First row is headers
              {headerConfidence < 70 && (
                <span className="text-amber-600 ml-2 text-xs">(not sure — please verify)</span>
              )}
            </label>
          </div>

          <PreviewTable
            rows={validatedRows}
            entityType={entityType}
            matches={matches}
            merges={merges}
            skippedHeaders={skippedHeaders}
            onEdit={handleEdit}
            onColumnChange={handleColumnChange}
          />

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => { reset(); setStep('paste') }} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Start over
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={validCount === 0}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Import {validCount} {config.label.toLowerCase()}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Importing {validCount} {config.label.toLowerCase()}...
          </p>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'results' && summary && (
        <ImportResults
          summary={summary}
          entityLabel={config.label}
          onImportMore={reset}
          onDone={() => onCancel?.()}
        />
      )}
    </div>
  )
}
