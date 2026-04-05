'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowRight, Info, Pencil, CheckCircle2 } from 'lucide-react'
import { ENTITY_CONFIGS, type EntityType, type MergeRule } from '@/lib/bulk-import/config'
import type { ColumnMatch, MergeInfo } from '@/lib/bulk-import/pipeline'

// Section groups — order matters (Property first, then Tenant near top)
const SECTION_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Property', keys: ['address', 'property_type', 'city'] },
  { label: 'Tenant', keys: ['full_name', 'phone', 'email'] },
  { label: 'Landlord', keys: ['landlord_name', 'landlord_phone', 'landlord_email'] },
  { label: 'Room', keys: ['room_number', 'room_name', 'monthly_rent', 'rent_due_day'] },
  { label: 'Tenancy', keys: ['tenancy_start_date', 'tenancy_end_date'] },
]

function getGroupForTarget(targetKey: string | null): string {
  if (!targetKey) return 'Skipped'
  for (const group of SECTION_GROUPS) {
    if (group.keys.includes(targetKey)) return group.label
  }
  return 'Skipped'
}

/** Normalize header text for merge alias matching */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[_\s-]/g, '')
}

interface ColumnMapperProps {
  sourceHeaders: string[]
  matches: ColumnMatch[]
  merges: MergeInfo[]
  entityType: EntityType
  onMappingComplete: (matches: ColumnMatch[], merges: MergeInfo[]) => void
}

export function ColumnMapper({
  sourceHeaders,
  matches,
  merges: initialMerges,
  entityType,
  onMappingComplete,
}: ColumnMapperProps) {
  const config = ENTITY_CONFIGS[entityType]
  const [localMatches, setLocalMatches] = useState<ColumnMatch[]>(() => [...matches])

  // Track which indices were auto-matched from initial detection
  const autoMatchedIndices = useMemo(() => {
    const set = new Set<number>()
    matches.forEach((m, idx) => {
      if (m.targetColumn && m.confidence !== 'unmatched') set.add(idx)
    })
    return set
  }, [matches])

  // Which targets are currently used
  const usedTargets = useMemo(() => {
    const used = new Map<string, number>() // target → source index
    localMatches.forEach((m, idx) => {
      if (m.targetColumn && m.confidence !== 'unmatched') used.set(m.targetColumn, idx)
    })
    return used
  }, [localMatches])

  // Keys consumed by active merges — hidden from dropdowns
  const mergeConsumedKeys = useMemo(() => {
    const consumed = new Set<string>()
    localMatches.forEach((m) => {
      if (m.confidence === 'merge' && m.targetColumn) consumed.add(m.targetColumn)
    })
    return consumed
  }, [localMatches])

  // Active merge labels for display
  const activeMerges = useMemo(() => {
    const active: { rule: MergeRule; label: string }[] = []
    for (const rule of config.mergeRules) {
      const allFound = rule.sourceSets.every((aliasSet) =>
        localMatches.some((m) => {
          if (!m.targetColumn || m.confidence === 'unmatched') return false
          return aliasSet.some((a) => norm(a) === norm(m.targetColumn!))
        })
      )
      if (allFound) active.push({ rule, label: rule.label })
    }
    return active
  }, [localMatches, config.mergeRules])

  const addressMapped = usedTargets.has('address') || usedTargets.has('postcode')
  const canContinue = addressMapped
  const skippedCount = localMatches.filter((m) => !m.targetColumn || m.confidence === 'unmatched').length

  // Group CSV columns by section
  const groupedRows = useMemo(() => {
    const groups = new Map<string, number[]>()
    for (const section of SECTION_GROUPS) groups.set(section.label, [])
    groups.set('Skipped', [])

    localMatches.forEach((match, idx) => {
      const group = match.confidence === 'merge'
        ? getGroupForTarget(match.targetColumn)
        : getGroupForTarget(match.targetColumn && match.confidence !== 'unmatched' ? match.targetColumn : null)
      const arr = groups.get(group) || []
      arr.push(idx)
      groups.set(group, arr)
    })
    return [...groups.entries()].filter(([, indices]) => indices.length > 0)
  }, [localMatches])

  // Check if a merge option exists for a given source header + target key
  // Returns merge label if this header can merge with another already-mapped header into targetKey
  const getMergeOption = (sourceIdx: number, targetKey: string): string | null => {
    const header = sourceHeaders[sourceIdx]
    for (const rule of config.mergeRules) {
      if (rule.targetColumn !== targetKey) continue
      // Check: does one source set match this header, and another match an already-mapped header?
      for (let i = 0; i < rule.sourceSets.length; i++) {
        const mySet = rule.sourceSets[i]
        if (!mySet.some((a) => norm(a) === norm(header))) continue
        // This header matches source set i. Check if other source sets are covered by other mapped headers.
        const otherSetsMatched = rule.sourceSets.every((otherSet, j) => {
          if (j === i) return true // skip my own set
          return localMatches.some((m, mIdx) => {
            if (mIdx === sourceIdx) return false // not myself
            if (m.confidence === 'unmatched' || !m.targetColumn) return false
            return otherSet.some((a) => norm(a) === norm(sourceHeaders[mIdx]))
          })
        })
        if (otherSetsMatched) {
          // Find the other header's name for display
          const otherIdx = localMatches.findIndex((m, mIdx) => {
            if (mIdx === sourceIdx) return false
            return rule.sourceSets.some((set, j) => j !== i && set.some((a) => norm(a) === norm(sourceHeaders[mIdx])))
          })
          const otherHeader = otherIdx >= 0 ? sourceHeaders[otherIdx] : ''
          return `merge with ${otherHeader}`
        }
      }
    }
    return null
  }

  const handleChange = (sourceIndex: number, targetKey: string | null) => {
    // Check if this is a merge selection
    if (targetKey && targetKey.startsWith('__merge__')) {
      const actualTarget = targetKey.replace('__merge__', '')
      // Find the merge rule
      const header = sourceHeaders[sourceIndex]
      for (const rule of config.mergeRules) {
        if (rule.targetColumn !== actualTarget) continue
        const mySetIdx = rule.sourceSets.findIndex((set) => set.some((a) => norm(a) === norm(header)))
        if (mySetIdx === -1) continue
        // Set all participating sources to merge confidence
        setLocalMatches((prev) => prev.map((m, idx) => {
          if (idx === sourceIndex) {
            return { ...m, targetColumn: actualTarget, confidence: 'merge' as const, needsReview: false }
          }
          // Find other sources that belong to this merge
          const isOtherSource = rule.sourceSets.some((set, j) => j !== mySetIdx && set.some((a) => norm(a) === norm(sourceHeaders[idx])))
          if (isOtherSource && (m.targetColumn === actualTarget || m.confidence === 'unmatched' || !m.targetColumn)) {
            return { ...m, targetColumn: actualTarget, confidence: 'merge' as const, needsReview: false }
          }
          return m
        }))
        return
      }
    }

    setLocalMatches((prev) => prev.map((m, idx) => {
      if (idx === sourceIndex) {
        return {
          ...m,
          targetColumn: targetKey,
          confidence: targetKey ? 'exact' as const : 'unmatched' as const,
          needsReview: false,
        }
      }
      return m
    }))
  }

  const handleUnmerge = (mergeTargetColumn: string) => {
    setLocalMatches((prev) => prev.map((m) => {
      if (m.confidence === 'merge' && m.targetColumn === mergeTargetColumn) {
        return { ...m, confidence: 'unmatched' as const, targetColumn: null, needsReview: false }
      }
      return m
    }))
  }

  const handleContinue = () => {
    const validMerges = initialMerges.filter((merge) =>
      merge.sourceIndices.every((idx) => localMatches[idx]?.confidence === 'merge')
    )
    onMappingComplete(localMatches, validMerges)
  }

  return (
    <div className="space-y-6 px-1">
      {/* Grouped mapping rows */}
      {groupedRows.map(([groupLabel, indices]) => (
        <div key={groupLabel} className="space-y-2">
          <h4 className="text-base font-semibold text-foreground px-1 pt-2">{groupLabel}</h4>

          {indices.map((idx) => {
            const header = sourceHeaders[idx]
            const match = localMatches[idx]
            const currentTarget = match?.targetColumn && match.confidence !== 'unmatched' ? match.targetColumn : null
            const isMerge = match?.confidence === 'merge'

            return (
              <div
                key={idx}
                className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center bg-card border border-border rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">{header}</span>
                  {autoMatchedIndices.has(idx) && currentTarget && (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      <span className="text-[10px] text-emerald-600 flex-shrink-0">auto-matched</span>
                    </>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                {isMerge ? (() => {
                  const mergeRule = config.mergeRules.find((r) =>
                    r.sourceSets.some((aliasSet) => aliasSet.some((a) => norm(a) === norm(header)))
                  )
                  const targetCol = mergeRule ? config.columns.find((c) => c.key === mergeRule.targetColumn) : null
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Merged into <span className="font-medium text-foreground">{targetCol?.label || 'unknown'}</span>
                      </span>
                      <button
                        onClick={() => handleUnmerge(match.targetColumn!)}
                        className="ml-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Unmerge and remap"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })() : (
                  <Select
                    value={currentTarget || '__skip__'}
                    onValueChange={(val) => handleChange(idx, val === '__skip__' ? null : val)}
                  >
                    <SelectTrigger className="h-9 text-sm rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">
                        <span className="text-muted-foreground">Skip (don&apos;t import)</span>
                      </SelectItem>
                      {SECTION_GROUPS.map((group) => (
                        <SelectGroup key={group.label}>
                          <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{group.label}</span>
                            <div className="flex-1 h-px bg-border" />
                          </SelectLabel>
                          {group.keys.map((key) => {
                            const col = config.columns.find((c) => c.key === key)
                            if (!col) return null
                            if (mergeConsumedKeys.has(key) && currentTarget !== key) return null

                            const inUse = usedTargets.has(key) && currentTarget !== key
                            const mergeLabel = inUse ? getMergeOption(idx, key) : null

                            if (inUse && !mergeLabel) {
                              return (
                                <SelectItem key={key} value={key} disabled>
                                  {col.label}
                                  {col.required && <span className="text-destructive ml-1">*</span>}
                                  <span className="text-muted-foreground ml-1 text-[10px]">(in use)</span>
                                </SelectItem>
                              )
                            }

                            if (inUse && mergeLabel) {
                              return (
                                <SelectItem key={key} value={`__merge__${key}`}>
                                  {col.label}
                                  <span className="text-primary ml-1 text-[10px]">({mergeLabel})</span>
                                </SelectItem>
                              )
                            }

                            return (
                              <SelectItem key={key} value={key}>
                                {col.label}
                                {col.required && <span className="text-destructive ml-1">*</span>}
                              </SelectItem>
                            )
                          })}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Merge indicators */}
      {activeMerges.length > 0 && (
        <div className="space-y-2">
          {activeMerges.map((merge, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm bg-muted/50 border border-border rounded-xl px-4 py-3">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">{merge.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary + Continue */}
      <div className="flex items-center justify-between pt-2 pb-2">
        <span className="text-xs text-muted-foreground">
          {sourceHeaders.length - skippedCount} mapped, {skippedCount} skipped
        </span>
        <Button
          size="sm"
          onClick={handleContinue}
          disabled={!canContinue}
          className="gap-1.5"
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
