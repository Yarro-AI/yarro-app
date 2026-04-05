'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
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
import { enrichAddressesWithCities } from '@/lib/postcode'
import { PasteInput } from './paste-input'
import { ColumnMapper } from './column-mapper'
import { ConfirmImport } from './confirm-import'
import { ImportResults } from './import-results'

type Step = 'paste' | 'map' | 'confirm' | 'importing' | 'results'

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
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [processing, setProcessing] = useState(false)

  // Derived
  const headers = hasHeaders ? rawRows[0]?.map((h) => h.trim()) || [] : rawRows[0]?.map((_, i) => `Column ${i + 1}`) || []
  const dataRows = hasHeaders ? rawRows.slice(1) : rawRows

  // ─── Step 1 → Step 2: After paste, detect headers + auto-match ──

  const handleParsed = useCallback(
    (rows: string[][]) => {
      setRawRows(rows)
      const detection = detectHasHeaders(rows, entityType)
      setHasHeaders(detection.hasHeaders)
      setHeaderConfidence(detection.confidence)

      const hdrs = detection.hasHeaders ? rows[0].map((h) => h.trim()) : rows[0].map((_, i) => `Column ${i + 1}`)
      const result = matchColumns(hdrs, entityType)
      setMatches(result.matches)
      setMerges(result.merges)
      setSkippedHeaders(result.skippedHeaders)
      setStep('map')
    },
    [entityType]
  )

  // ─── Step 2: Header toggle (re-runs matching) ──

  const handleHeaderToggle = useCallback(
    (checked: boolean) => {
      setHasHeaders(checked)
      const hdrs = checked ? rawRows[0].map((h) => h.trim()) : rawRows[0].map((_, i) => `Column ${i + 1}`)
      const result = matchColumns(hdrs, entityType)
      setMatches(result.matches)
      setMerges(result.merges)
      setSkippedHeaders(result.skippedHeaders)
    },
    [rawRows, entityType]
  )

  // ─── Step 2 → Step 3: User finishes mapping, process data ──

  const handleMappingComplete = useCallback(
    async (finalMatches: ColumnMatch[], validMerges: MergeInfo[]) => {
      setMatches(finalMatches)
      setMerges(validMerges)
      setProcessing(true)
      setStep('confirm')

      // Compute skipped headers
      const skipped = finalMatches
        .filter((m) => !m.targetColumn || m.confidence === 'unmatched')
        .map((m) => m.sourceHeader)
      setSkippedHeaders(skipped)

      const finalMerges = validMerges

      // Run pipeline
      const mapped = applyMapping(dataRows, finalMatches, finalMerges)
      let normalized = normalizeRows(mapped, entityType)

      // City enrichment (unified only)
      if (entityType === 'unified') {
        const addressesNeedingCity = normalized
          .filter((r) => r.address && !r.city)
          .map((r) => r.address)

        if (addressesNeedingCity.length > 0) {
          try {
            const cityMap = await enrichAddressesWithCities([...new Set(addressesNeedingCity)])
            normalized = normalized.map((r) => {
              if (r.address && !r.city) {
                const city = cityMap.get(r.address)
                if (city) return { ...r, city }
              }
              return r
            })
          } catch {
            // Best-effort — don't block on failure
          }
        }
      }

      const validated = validateRows(normalized, entityType)
      setValidatedRows(validated)
      setProcessing(false)
    },
    [dataRows, merges, entityType]
  )

  // ─── Step 3 → Step 4: Import ──

  const handleImport = useCallback(async () => {
    if (!propertyManager) return
    setStep('importing')

    const rowsToImport = validatedRows
      .filter((r) => Object.keys(r.errors).length === 0)
      .map((r) => r.data)

    if (rowsToImport.length === 0) {
      toast.error('No valid rows to import')
      setStep('confirm')
      return
    }

    try {
      const { data, error } = await supabase.rpc(config.rpcName, {
        p_pm_id: propertyManager.id,
        p_data: rowsToImport,
      })

      if (error) {
        toast.error(error.message || 'Import failed')
        setStep('confirm')
        return
      }

      const result = data as unknown as ImportSummary
      setSummary(result)
      setStep('results')

      if (result.created > 0) {
        if (entityType === 'unified') {
          const parts = []
          if (result.properties_created) parts.push(`${result.properties_created} properties`)
          if (result.rooms_created) parts.push(`${result.rooms_created} rooms`)
          if (result.tenants_created) parts.push(`${result.tenants_created} tenants`)
          toast.success(parts.length > 0 ? `Imported: ${parts.join(', ')}` : `${result.created} records imported`)
        } else {
          toast.success(`${result.created} ${config.label.toLowerCase()} imported`)
        }
      }

      onComplete?.(result)
    } catch {
      toast.error('Import failed — please try again')
      setStep('confirm')
    }
  }, [propertyManager, validatedRows, config, supabase, onComplete, entityType])

  // ─── Reset ──

  const reset = useCallback(() => {
    setStep('paste')
    setRawRows([])
    setMatches([])
    setMerges([])
    setSkippedHeaders([])
    setValidatedRows([])
    setSummary(null)
    setProcessing(false)
  }, [])

  // ─── Render ──

  return (
    <div className="space-y-5">
      {/* Instructional title */}
      {step === 'map' && (
        <div className="text-center space-y-2 py-4">
          <h2 className="text-2xl font-semibold text-foreground">Link your columns</h2>
          <p className="text-sm text-muted-foreground">
            Match your CSV columns to the right fields. Columns that don&apos;t match can be skipped.
          </p>
        </div>
      )}

      {/* Step 1: Paste */}
      {step === 'paste' && (
        <div className="px-1">
          <PasteInput
            onParsed={handleParsed}
            onError={(err) => toast.error(err)}
          />
        </div>
      )}

      {/* Step 2: Map */}
      {step === 'map' && (
        <ColumnMapper
          sourceHeaders={headers}
          matches={matches}
          merges={merges}
          entityType={entityType}
          onMappingComplete={handleMappingComplete}
        />
      )}

      {/* Step 3: Confirm (with loading) */}
      {step === 'confirm' && (
        processing ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processing your data...</p>
          </div>
        ) : (
          <ConfirmImport
            validatedRows={validatedRows}
            entityType={entityType}
            merges={merges}
            skippedHeaders={skippedHeaders}
            onConfirm={handleImport}
            onBack={() => setStep('map')}
          />
        )
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Importing your data...
          </p>
        </div>
      )}

      {/* Step 5: Results */}
      {step === 'results' && summary && (
        <ImportResults
          summary={summary}
          entityType={entityType}
          entityLabel={config.label}
          onImportMore={reset}
          onDone={() => onCancel?.()}
        />
      )}
    </div>
  )
}
