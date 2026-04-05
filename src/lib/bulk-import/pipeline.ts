// Bulk import pipeline: parsing, header detection, column matching with merges,
// normalization, and validation.
//
// This is a UI convenience layer — it helps users map their spreadsheet
// columns to our schema. The RPCs are authoritative for dedup, validation,
// and insert. Frontend normalization improves preview accuracy only.

import Papa from 'papaparse'
import { normalizeRecord } from '@/lib/normalize'
import { ENTITY_CONFIGS, type EntityType, type MergeRule } from './config'

// ─── Types ─────────────────────────────────────────────────

export type MatchConfidence = 'exact' | 'alias' | 'merge' | 'unmatched'

export interface ColumnMatch {
  sourceIndex: number
  sourceHeader: string
  targetColumn: string | null
  confidence: MatchConfidence
  needsReview: boolean
  mergedFrom?: { sourceIndices: number[]; label: string }
}

export interface MergeInfo {
  rule: MergeRule
  sourceIndices: number[] // indices of matched source columns, in order of sourceSets
}

export interface ParseResult {
  rows: string[][]
  error?: string
}

export interface ValidatedRow {
  data: Record<string, string>
  errors: Record<string, string>
  warnings: Record<string, string>
}

export interface ImportSummary {
  batch_id: string
  results: { row: number; status: 'created' | 'skipped' | 'error'; error?: string; id?: string }[]
  total: number
  created: number
  skipped: number
  errors: number
}

// ─── Constants ─────────────────────────────────────────────

const MAX_ROWS = 500
const PREVIEW_ROWS = 50

// ─── Step 1: Parsing ───────────────────────────────────────

export function parseText(rawText: string): ParseResult {
  const trimmed = rawText.trim()
  if (!trimmed) return { rows: [], error: 'No data provided' }

  const result = Papa.parse<string[]>(trimmed, {
    header: false,
    delimiter: '',
    skipEmptyLines: true,
  })

  const rows = result.data.filter((row) => row.some((cell) => cell.trim() !== ''))

  if (rows.length === 0) return { rows: [], error: 'No data rows found' }
  if (rows.length > MAX_ROWS + 1) {
    return { rows: [], error: `Maximum ${MAX_ROWS} rows per import. Found ${rows.length - 1} data rows.` }
  }

  return { rows }
}

export function parseFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<string[]>(file, {
      header: false,
      delimiter: '',
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.filter((row) => row.some((cell) => cell.trim() !== ''))
        if (rows.length === 0) {
          resolve({ rows: [], error: 'No data rows found in file' })
          return
        }
        if (rows.length > MAX_ROWS + 1) {
          resolve({ rows: [], error: `Maximum ${MAX_ROWS} rows per import. Found ${rows.length - 1} data rows.` })
          return
        }
        resolve({ rows })
      },
      error: (err) => {
        resolve({ rows: [], error: `Failed to parse file: ${err.message}` })
      },
    })
  })
}

// ─── Step 2: Header Detection ──────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[\d\s\+\-\(\)]{7,}$/
const POSTCODE_RE = /[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}/i

function looksLikeData(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (EMAIL_RE.test(v)) return true
  if (PHONE_RE.test(v) && v.replace(/\D/g, '').length >= 10) return true
  if (POSTCODE_RE.test(v)) return true
  return false
}

export function detectHasHeaders(
  rows: string[][],
  entityType: EntityType
): { hasHeaders: boolean; confidence: number } {
  if (rows.length === 0) return { hasHeaders: false, confidence: 0 }

  const firstRow = rows[0]
  const config = ENTITY_CONFIGS[entityType]
  const allNames = config.columns.flatMap((c) => [
    c.key,
    c.label.toLowerCase(),
    ...c.aliases,
  ])
  // Also include merge rule source aliases
  const mergeAliases = config.mergeRules.flatMap((r) => r.sourceSets.flat())
  const allKnown = [...allNames, ...mergeAliases]

  const normalized = firstRow.map((v) => v.trim().toLowerCase().replace(/[_\s-]/g, ''))
  const headerMatches = normalized.filter((v) =>
    allKnown.some((name) => name.toLowerCase().replace(/[_\s-]/g, '') === v)
  ).length

  const dataLikeCount = firstRow.filter(looksLikeData).length

  if (headerMatches >= 2) return { hasHeaders: true, confidence: 95 }
  if (headerMatches >= 1 && dataLikeCount === 0) return { hasHeaders: true, confidence: 80 }
  if (dataLikeCount >= 2) return { hasHeaders: false, confidence: 90 }
  if (dataLikeCount >= 1) return { hasHeaders: false, confidence: 70 }

  const allShortText = firstRow.every((v) => v.trim().length < 30 && !/\d/.test(v))
  if (allShortText) return { hasHeaders: true, confidence: 60 }

  return { hasHeaders: false, confidence: 50 }
}

// ─── Step 3: Column Matching ───────────────────────────────
// Priority: merge > exact > alias > unmatched

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_\s-]/g, '')
}

/** Check if a header matches any alias in a set */
function matchesAliasSet(headerNormalized: string, aliases: string[]): boolean {
  return aliases.some((a) => normalizeHeader(a) === headerNormalized)
}

/** Detect merges first, then match remaining columns */
export function matchColumns(
  headers: string[],
  entityType: EntityType
): { matches: ColumnMatch[]; merges: MergeInfo[]; skippedHeaders: string[] } {
  const config = ENTITY_CONFIGS[entityType]
  const normalizedHeaders = headers.map((h) => normalizeHeader(h))
  const consumed = new Set<number>() // indices consumed by merges
  const merges: MergeInfo[] = []

  // ── Phase 0: Merge detection (highest priority) ──
  for (const rule of config.mergeRules) {
    const sourceIndices: number[] = []
    let allFound = true

    for (const aliasSet of rule.sourceSets) {
      const idx = normalizedHeaders.findIndex(
        (nh, i) => !consumed.has(i) && matchesAliasSet(nh, aliasSet)
      )
      if (idx === -1) {
        allFound = false
        break
      }
      sourceIndices.push(idx)
    }

    if (allFound) {
      // Check: is the target column already claimed by an exact match?
      const targetAlreadyExact = normalizedHeaders.findIndex(
        (nh, i) => !consumed.has(i) && !sourceIndices.includes(i) &&
          (normalizeHeader(config.columns.find((c) => c.key === rule.targetColumn)?.key || '') === nh ||
           normalizeHeader(config.columns.find((c) => c.key === rule.targetColumn)?.label || '') === nh)
      )

      if (targetAlreadyExact !== -1) {
        // Both merge sources AND exact target exist → all marked needsReview later
        continue
      }

      sourceIndices.forEach((i) => consumed.add(i))
      merges.push({ rule, sourceIndices })
    }
  }

  // ── Phase 1+2: Exact + Alias matching on unclaimed columns ──
  const matches: ColumnMatch[] = []

  for (let i = 0; i < headers.length; i++) {
    if (consumed.has(i)) {
      // This column was consumed by a merge — find which merge
      const merge = merges.find((m) => m.sourceIndices.includes(i))
      matches.push({
        sourceIndex: i,
        sourceHeader: headers[i].trim(),
        targetColumn: merge?.rule.targetColumn || null,
        confidence: 'merge',
        needsReview: false,
        mergedFrom: merge ? { sourceIndices: merge.sourceIndices, label: merge.rule.label } : undefined,
      })
      continue
    }

    const sourceHeader = headers[i].trim()
    const nh = normalizedHeaders[i]
    let match: ColumnMatch = {
      sourceIndex: i,
      sourceHeader,
      targetColumn: null,
      confidence: 'unmatched',
      needsReview: false,
    }

    // Tier 1: Exact match (key or label)
    const exactMatch = config.columns.find(
      (c) => normalizeHeader(c.key) === nh || normalizeHeader(c.label) === nh
    )
    if (exactMatch) {
      match = { ...match, targetColumn: exactMatch.key, confidence: 'exact' }
    }

    // Tier 2: Alias match
    if (!match.targetColumn) {
      const aliasMatch = config.columns.find((c) =>
        c.aliases.some((alias) => normalizeHeader(alias) === nh)
      )
      if (aliasMatch) {
        match = { ...match, targetColumn: aliasMatch.key, confidence: 'alias' }
      }
    }

    matches.push(match)
  }

  // ── Duplicate target detection ──
  const targetCounts = new Map<string, number[]>()
  matches.forEach((m, idx) => {
    if (m.targetColumn) {
      const existing = targetCounts.get(m.targetColumn) || []
      existing.push(idx)
      targetCounts.set(m.targetColumn, existing)
    }
  })

  for (const [, indices] of targetCounts) {
    if (indices.length > 1) {
      for (const idx of indices) {
        matches[idx].needsReview = true
      }
    }
  }

  // Collect skipped headers (unmatched, not consumed by merge)
  const skippedHeaders = matches
    .filter((m) => m.confidence === 'unmatched' && !m.mergedFrom)
    .map((m) => m.sourceHeader)

  return { matches, merges, skippedHeaders }
}

// ─── Step 4: Apply Mapping + Merges ────────────────────────

export function applyMapping(
  dataRows: string[][],
  matches: ColumnMatch[],
  merges: MergeInfo[]
): Record<string, string>[] {
  return dataRows.map((row) => {
    const record: Record<string, string> = {}

    // Apply direct column matches
    for (const match of matches) {
      if (match.targetColumn && !match.needsReview && match.confidence !== 'merge') {
        const value = row[match.sourceIndex]?.trim() ?? ''
        if (value) {
          record[match.targetColumn] = value
        }
      }
    }

    // Apply merges
    for (const merge of merges) {
      const parts = merge.sourceIndices.map((i) => row[i]?.trim() ?? '')
      const combined = merge.rule.combiner === 'concat_space'
        ? parts.filter(Boolean).join(' ')
        : parts.filter(Boolean).join(', ')
      if (combined) {
        record[merge.rule.targetColumn] = combined
      }
    }

    return record
  })
}

// ─── Step 5: Normalization ─────────────────────────────────

export function normalizeRows(
  rows: Record<string, string>[],
  entityType: EntityType
): Record<string, string>[] {
  const normalizeType = entityType === 'contractors' ? 'contractors'
    : entityType === 'tenants' ? 'tenants'
    : 'properties'

  return rows.map((row) => {
    const normalized = normalizeRecord(normalizeType, { ...row }) as Record<string, string>

    if (normalized.property_address) {
      normalized.property_address = normalized.property_address.trim()
    }
    if (normalized.role_tag) {
      normalized.role_tag = normalized.role_tag.trim()
    }

    // Remove empty string values
    for (const key of Object.keys(normalized)) {
      if (normalized[key] === '' || normalized[key] === undefined) {
        delete normalized[key]
      }
    }

    return normalized
  })
}

// ─── Step 6: Validation ────────────────────────────────────

export function validateRows(
  rows: Record<string, string>[],
  entityType: EntityType
): ValidatedRow[] {
  const config = ENTITY_CONFIGS[entityType]

  return rows.map((data) => {
    const errors: Record<string, string> = {}
    const warnings: Record<string, string> = {}

    // Check required fields (hard-required only)
    for (const col of config.columns) {
      if (col.required && (!data[col.key] || data[col.key].trim() === '')) {
        errors[col.key] = `${col.label} is required`
      }
    }

    // Entity-specific validation
    if (entityType === 'properties') {
      if (data.address && !/[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}/i.test(data.address)) {
        errors.address = 'Address must include a UK postcode'
      }
    }

    if (entityType === 'tenants') {
      // At least name or phone (RPC allows either)
      if (!data.full_name && !data.phone) {
        errors.full_name = 'Name or phone is required'
      }
      if (data.email && !EMAIL_RE.test(data.email)) {
        warnings.email = 'Email may not be valid'
      }
    }

    if (entityType === 'contractors') {
      if (data.contractor_email && !EMAIL_RE.test(data.contractor_email)) {
        warnings.contractor_email = 'Email may not be valid'
      }
    }

    return { data, errors, warnings }
  })
}

// ─── Full Pipeline ─────────────────────────────────────────

export function runPipeline(
  rows: string[][],
  entityType: EntityType,
  hasHeaders: boolean
) {
  const headers = hasHeaders ? rows[0].map((h) => h.trim()) : rows[0].map((_, i) => `Column ${i + 1}`)
  const dataRows = hasHeaders ? rows.slice(1) : rows

  const { matches, merges, skippedHeaders } = matchColumns(headers, entityType)
  const mappedRows = applyMapping(dataRows, matches, merges)
  const normalizedRows = normalizeRows(mappedRows, entityType)
  const validatedRows = validateRows(normalizedRows, entityType)

  return { matches, merges, skippedHeaders, headers, dataRows, mappedRows, normalizedRows, validatedRows }
}

export { MAX_ROWS, PREVIEW_ROWS }
