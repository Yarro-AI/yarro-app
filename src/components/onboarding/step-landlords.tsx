'use client'

import { EditableTable, ColumnDef } from './editable-table'
import { CsvUpload } from './csv-upload'
import { Lightbulb } from 'lucide-react'

export interface LandlordPersona {
  tempId: string
  name: string
  email: string
  phone: string
}

interface StepLandlordsProps {
  landlords: LandlordPersona[]
  onChange: (landlords: LandlordPersona[]) => void
}

const columns: ColumnDef[] = [
  { key: 'name', label: 'Name', required: true, placeholder: 'David Williams' },
  { key: 'phone', label: 'Phone', required: true, placeholder: '07700 900200' },
  { key: 'email', label: 'Email', placeholder: 'david.williams@example.com' },
]

const CSV_COLUMNS = ['name', 'email', 'phone']

export function StepLandlords({ landlords, onChange }: StepLandlordsProps) {
  const rows = landlords.map((l) => ({
    name: l.name,
    email: l.email,
    phone: l.phone,
  }))

  const handleRowsChange = (newRows: Record<string, string>[]) => {
    const updated: LandlordPersona[] = newRows.map((row, i) => ({
      tempId: landlords[i]?.tempId || crypto.randomUUID(),
      name: (row.name || '').trim(),
      email: (row.email || '').trim(),
      phone: (row.phone || '').trim(),
    }))
    onChange(updated)
  }

  const handleCsvParsed = (csvRows: Record<string, string>[]) => {
    const newLandlords: LandlordPersona[] = csvRows.map((row) => ({
      tempId: crypto.randomUUID(),
      name: (row.name || '').trim(),
      email: (row.email || '').trim(),
      phone: (row.phone || '').trim(),
    }))
    onChange([...landlords.filter((l) => l.name.trim()), ...newLandlords])
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Landlords</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add the landlords you manage properties for. You&apos;ll link them to properties in the next step.
        </p>
      </div>

      <EditableTable columns={columns} rows={rows} onChange={handleRowsChange} />

      <CsvUpload
        expectedColumns={CSV_COLUMNS}
        onParsed={handleCsvParsed}
        templateFilename="landlords_template.csv"
      />

      <div className="flex gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
        <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Use exact names for auto-linking
          </p>
          <p className="text-amber-700 dark:text-amber-300 mt-1">
            In the next step, you can upload properties with a &quot;landlord_name&quot; column. If the name matches exactly (case-insensitive), the landlord will be auto-linked. E.g., &quot;David Williams&quot; or &quot;david williams&quot; will both match.
          </p>
        </div>
      </div>
    </div>
  )
}
