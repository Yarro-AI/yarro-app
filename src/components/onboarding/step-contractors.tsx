'use client'

import { EditableTable, ColumnDef } from './editable-table'
import { CsvUpload } from './csv-upload'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'
import { Info } from 'lucide-react'

export interface ContractorEntry {
  contractor_name: string
  category: string
  contractor_phone: string
  contractor_email: string
  property_ids: string[] | null // null = all properties
}

interface StepContractorsProps {
  contractors: ContractorEntry[]
  onChange: (contractors: ContractorEntry[]) => void
}

const CSV_COLUMNS = ['contractor_name', 'category', 'contractor_phone', 'contractor_email']

const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}))

export function StepContractors({ contractors, onChange }: StepContractorsProps) {
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
    const updated: ContractorEntry[] = newRows.map((row) => ({
      contractor_name: row.contractor_name || '',
      category: row.category || '',
      contractor_phone: row.contractor_phone || '',
      contractor_email: row.contractor_email || '',
      property_ids: null, // null = available for all properties
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
      <p className="text-xs text-muted-foreground">
        <strong>Tip:</strong> Use exact category names in your CSV (e.g. &quot;Plumber&quot;, &quot;Electrician&quot;). Non-matching categories will need manual selection.
      </p>

      {/* Info about property assignment */}
      <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            Contractors are available for all your properties by default
          </p>
          <p className="text-blue-700 dark:text-blue-300 mt-1">
            Add your main contractors here. You can restrict specific contractors to certain properties later from the Contractors page, or add additional contractors as needed.
          </p>
        </div>
      </div>
    </div>
  )
}
