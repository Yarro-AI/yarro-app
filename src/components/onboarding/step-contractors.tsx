'use client'

import { useState } from 'react'
import { EditableTable, ColumnDef } from './editable-table'
import { CsvUpload } from './csv-upload'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'
import { Info, Pencil, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export interface ContractorEntry {
  contractor_name: string
  category: string
  contractor_phone: string
  contractor_email: string
  property_ids: string[] | null // null = all properties
}

interface PropertyOption {
  id: string
  address: string
}

interface StepContractorsProps {
  contractors: ContractorEntry[]
  properties: PropertyOption[]
  onChange: (contractors: ContractorEntry[]) => void
}

const CSV_COLUMNS = ['contractor_name', 'category', 'contractor_phone', 'contractor_email']

const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}))

export function StepContractors({ contractors, properties, onChange }: StepContractorsProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [selectedProperties, setSelectedProperties] = useState<string[]>([])

  const columns: ColumnDef[] = [
    { key: 'contractor_name', label: 'Name', required: true, placeholder: 'QuickFix Plumbing Ltd' },
    { key: 'category', label: 'Category', required: true, type: 'select', options: CATEGORY_OPTIONS },
    { key: 'contractor_phone', label: 'Phone', required: true, placeholder: '07700 900500' },
    { key: 'contractor_email', label: 'Email', placeholder: 'info@quickfix-demo.co.uk' },
  ]

  const rows = contractors.map((c) => ({
    contractor_name: c.contractor_name,
    category: c.category,
    contractor_phone: c.contractor_phone,
    contractor_email: c.contractor_email,
  }))

  const handleRowsChange = (newRows: Record<string, string>[]) => {
    const updated: ContractorEntry[] = newRows.map((row, i) => ({
      contractor_name: row.contractor_name || '',
      category: row.category || '',
      contractor_phone: row.contractor_phone || '',
      contractor_email: row.contractor_email || '',
      property_ids: contractors[i]?.property_ids ?? null, // Preserve existing assignment
    }))
    onChange(updated)
  }

  const handleCsvParsed = (csvRows: Record<string, string>[]) => {
    const newContractors: ContractorEntry[] = csvRows.map((row) => {
      // Match category against known list (case-insensitive)
      let category = ''
      if (row.category) {
        const match = CATEGORY_OPTIONS.find(
          (c) => c.value.toLowerCase() === row.category.toLowerCase().trim()
        )
        if (match) category = match.value
      }

      return {
        contractor_name: row.contractor_name || '',
        category,
        contractor_phone: row.contractor_phone || '',
        contractor_email: row.contractor_email || '',
        property_ids: null, // null = available for all properties
      }
    })
    onChange([...contractors.filter((c) => c.contractor_name), ...newContractors])
  }

  const openPropertyModal = (idx: number) => {
    const contractor = contractors[idx]
    // If null (all), start with empty selection (meaning "all" until they select specific ones)
    setSelectedProperties(contractor.property_ids || [])
    setEditingIdx(idx)
  }

  const savePropertyAssignment = () => {
    if (editingIdx === null) return
    const updated = [...contractors]
    // If no properties selected, set to null (all properties)
    updated[editingIdx] = {
      ...updated[editingIdx],
      property_ids: selectedProperties.length > 0 ? selectedProperties : null,
    }
    onChange(updated)
    setEditingIdx(null)
  }

  const toggleProperty = (propertyId: string) => {
    setSelectedProperties((prev) =>
      prev.includes(propertyId)
        ? prev.filter((id) => id !== propertyId)
        : [...prev, propertyId]
    )
  }

  const setAllProperties = () => {
    setSelectedProperties([])
  }

  const namedContractors = contractors.filter((c) => c.contractor_name.trim())

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Contractors</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add your contractors with their category and contact info.
        </p>
      </div>

      <EditableTable columns={columns} rows={rows} onChange={handleRowsChange} highlightEmptySelections />

      <CsvUpload
        expectedColumns={CSV_COLUMNS}
        onParsed={handleCsvParsed}
        templateFilename="contractors_template.csv"
      />

      {/* How automated tickets work */}
      <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm space-y-2">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            How automated ticket assignment works
          </p>
          <p className="text-blue-700 dark:text-blue-300">
            When a tenant reports an issue, Yarro automatically matches it to a <strong>category</strong> (e.g., &quot;Plumber&quot; for a leak). Contractors are then selected based on:
          </p>
          <ol className="list-decimal list-inside text-blue-700 dark:text-blue-300 space-y-1 ml-1">
            <li>Their category matches the issue</li>
            <li>They serve the property (by default: all properties)</li>
          </ol>
          <p className="text-blue-700 dark:text-blue-300">
            You can customise property assignments below, or edit them later from the Contractors page.
          </p>
        </div>
      </div>

      {/* Property Assignment Section */}
      {namedContractors.length > 0 && properties.length > 0 && (
        <div className="space-y-3 pt-2">
          <div>
            <h3 className="text-sm font-medium">Assigned Properties</h3>
            <p className="text-xs text-muted-foreground">Click to customise which properties each contractor serves. Default is all properties.</p>
          </div>
          <div className="border rounded-lg divide-y">
            {namedContractors.map((contractor) => {
              const realIdx = contractors.indexOf(contractor)
              const isAll = contractor.property_ids === null || contractor.property_ids.length === 0
              const assignedCount = contractor.property_ids?.length || 0
              return (
                <div
                  key={realIdx}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{contractor.contractor_name}</p>
                    <p className="text-xs text-muted-foreground">{contractor.category || 'No category'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPropertyModal(realIdx)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    <span className={isAll ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                      {isAll ? 'All Properties' : `${assignedCount} ${assignedCount === 1 ? 'Property' : 'Properties'}`}
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Property Assignment Modal */}
      <Dialog open={editingIdx !== null} onOpenChange={(open) => !open && setEditingIdx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assign Properties — {editingIdx !== null ? contractors[editingIdx]?.contractor_name : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select which properties this contractor can serve. Leave empty for all properties.
            </p>

            <Button
              type="button"
              variant={selectedProperties.length === 0 ? 'default' : 'outline'}
              size="sm"
              onClick={setAllProperties}
              className="w-full justify-start"
            >
              <Check className={`h-4 w-4 mr-2 ${selectedProperties.length === 0 ? 'opacity-100' : 'opacity-0'}`} />
              All Properties (default)
            </Button>

            <div className="border-t pt-4 space-y-2 max-h-64 overflow-y-auto">
              {properties.map((p) => {
                const isSelected = selectedProperties.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProperty(p.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                      isSelected
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'bg-muted/50 hover:bg-muted border border-transparent'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <div className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span className="truncate">{p.address}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIdx(null)}>
              Cancel
            </Button>
            <Button onClick={savePropertyAssignment}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
