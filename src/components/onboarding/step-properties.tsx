'use client'

import { EditableTable, ColumnDef } from './editable-table'
import { CsvUpload } from './csv-upload'
import { Lightbulb } from 'lucide-react'
import type { LandlordPersona } from './step-landlords'

export interface PropertyEntry {
  tempId: string
  address: string
  landlordTempId: string
  access_instructions: string
  emergency_access_contact: string
  auto_approve_limit: string
  city: string // Auto-extracted from postcode
  // After insert:
  insertedId?: string
}

interface StepPropertiesProps {
  properties: PropertyEntry[]
  landlords: LandlordPersona[]
  onChange: (properties: PropertyEntry[]) => void
  onLookupCity?: (address: string, index: number) => void
}

const CSV_COLUMNS = ['address', 'landlord_name', 'landlord_email', 'landlord_phone', 'access_instructions', 'emergency_access_contact', 'auto_approve_limit']

export function StepProperties({ properties, landlords, onChange, onLookupCity }: StepPropertiesProps) {
  const landlordOptions = landlords
    .filter((l) => l.name)
    .map((l) => ({ value: l.tempId, label: l.name }))

  const columns: ColumnDef[] = [
    { key: 'address', label: 'Address', required: true, placeholder: '14 Meadow Lane, Manchester, M14 5RL', width: '30%' },
    ...(landlordOptions.length > 0
      ? [{ key: 'landlordTempId', label: 'Landlord', type: 'combobox' as const, options: landlordOptions, placeholder: 'Search landlord...' }]
      : []),
    { key: 'auto_approve_limit', label: 'Auto-Approve (£)', required: true, type: 'number' as const, placeholder: '0' },
    { key: 'access_instructions', label: 'Access Details', placeholder: 'Gate code, key safe number, entry instructions' },
    { key: 'emergency_access_contact', label: 'Emergency Contact', placeholder: '07700 900300' },
  ]

  const rows = properties.map((p) => ({
    address: p.address,
    landlordTempId: p.landlordTempId,
    auto_approve_limit: p.auto_approve_limit,
    access_instructions: p.access_instructions,
    emergency_access_contact: p.emergency_access_contact,
  }))

  const handleRowsChange = (newRows: Record<string, string>[]) => {
    const updated: PropertyEntry[] = newRows.map((row, i) => {
      const existingProperty = properties[i]
      const addressChanged = row.address !== existingProperty?.address

      // If address changed and we have a lookup callback, trigger it
      if (addressChanged && row.address && onLookupCity) {
        onLookupCity(row.address, i)
      }

      return {
        tempId: existingProperty?.tempId || crypto.randomUUID(),
        address: row.address || '',
        landlordTempId: row.landlordTempId || '',
        auto_approve_limit: row.auto_approve_limit || '',
        access_instructions: row.access_instructions || '',
        emergency_access_contact: row.emergency_access_contact || '',
        city: addressChanged ? '' : (existingProperty?.city || ''), // Reset city if address changed
        insertedId: existingProperty?.insertedId,
      }
    })
    onChange(updated)
  }

  const handleCsvParsed = (csvRows: Record<string, string>[]) => {
    const newProperties: PropertyEntry[] = csvRows.map((row, i) => {
      // Try to match landlord by name
      let landlordTempId = ''
      if (row.landlord_name) {
        const match = landlords.find(
          (l) => l.name.trim().toLowerCase() === row.landlord_name.trim().toLowerCase()
        )
        if (match) landlordTempId = match.tempId
      }

      const prop: PropertyEntry = {
        tempId: crypto.randomUUID(),
        address: row.address || '',
        landlordTempId,
        auto_approve_limit: row.auto_approve_limit || '',
        access_instructions: row.access_instructions || '',
        emergency_access_contact: row.emergency_access_contact || '',
        city: '', // Will be looked up by parent
      }

      // Trigger city lookup for each new property
      if (prop.address && onLookupCity) {
        const newIndex = properties.filter((p) => p.address).length + i
        onLookupCity(prop.address, newIndex)
      }

      return prop
    })
    onChange([...properties.filter((p) => p.address), ...newProperties])
  }

  // Get unique cities for display
  const uniqueCities = [...new Set(properties.map((p) => p.city).filter(Boolean))]

  // Action column to show city
  const actionColumn = {
    label: 'City',
    width: '12%',
    render: (rowIdx: number) => {
      const property = properties[rowIdx]
      if (!property?.address?.trim()) {
        return <span className="text-xs text-muted-foreground">—</span>
      }
      if (!property.city) {
        return (
          <span className="text-xs text-amber-600 dark:text-amber-400 italic">
            Looking up...
          </span>
        )
      }
      return (
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          {property.city}
        </span>
      )
    },
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Properties</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add your properties. {landlordOptions.length > 0 && 'Select a landlord from Step 1 to auto-fill their details.'}
        </p>
      </div>

      <EditableTable
        columns={columns}
        rows={rows}
        onChange={handleRowsChange}
        highlightEmptySelections
        actionColumn={actionColumn}
      />

      <CsvUpload
        expectedColumns={CSV_COLUMNS}
        onParsed={handleCsvParsed}
        templateFilename="properties_template.csv"
        exampleRow={{
          address: '14 Meadow Lane, Manchester, M14 5RL',
          landlord_name: 'David Williams',
          landlord_email: 'david.williams@example.com',
          landlord_phone: '07700 900200',
          access_instructions: 'Key safe code 4521',
          emergency_access_contact: '07700 900300',
          auto_approve_limit: '250',
        }}
      />

      {/* Unified info box */}
      <div className="flex gap-3 p-4 bg-muted/30 border border-border rounded-lg">
        <Lightbulb className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm space-y-3">
          <div>
            <p className="font-medium text-foreground">
              How property import works
            </p>
            <ul className="text-muted-foreground mt-1.5 space-y-1 list-disc list-inside">
              <li>Addresses must end with a valid UK postcode (e.g., &quot;M14 5RL&quot;)</li>
              <li>Use exact landlord names from Step 1 in your CSV &quot;landlord_name&quot; column — non-matches highlight amber</li>
              <li>Cities are auto-extracted from postcodes for contractor service area matching</li>
            </ul>
          </div>
          {uniqueCities.length > 0 && (
            <p className="text-muted-foreground pt-1 border-t border-border">
              <strong>Cities found:</strong> {uniqueCities.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
