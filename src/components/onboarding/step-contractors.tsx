'use client'

import { useState } from 'react'
import { EditableTable, ColumnDef } from './editable-table'
import { CsvUpload } from './csv-upload'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'
import { MapPin, Pencil, Check } from 'lucide-react'
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
  categories: string[]
  contractor_phone: string
  contractor_email: string
  service_areas: string[] // Cities they serve (empty = no auto-assignment)
}

interface StepContractorsProps {
  contractors: ContractorEntry[]
  availableCities: string[] // Cities extracted from properties
  onChange: (contractors: ContractorEntry[]) => void
}

const CSV_COLUMNS = ['contractor_name', 'categories', 'contractor_phone', 'contractor_email', 'service_areas']

const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}))

export function StepContractors({ contractors, availableCities, onChange }: StepContractorsProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [selectedCities, setSelectedCities] = useState<string[]>([])

  const columns: ColumnDef[] = [
    { key: 'contractor_name', label: 'Name', required: true, placeholder: 'QuickFix Plumbing Ltd', width: '25%' },
    { key: 'categories', label: 'Categories', required: true, type: 'multiselect', options: CATEGORY_OPTIONS, placeholder: 'Select categories...', width: '22%' },
    { key: 'contractor_phone', label: 'Phone', required: true, placeholder: '07700 900500', width: '18%' },
    { key: 'contractor_email', label: 'Email', placeholder: 'info@quickfix-demo.co.uk', width: '22%' },
  ]

  const rows = contractors.map((c) => ({
    contractor_name: c.contractor_name,
    categories: c.categories.join(','),
    contractor_phone: c.contractor_phone,
    contractor_email: c.contractor_email,
  }))

  const handleRowsChange = (newRows: Record<string, string>[]) => {
    const updated: ContractorEntry[] = newRows.map((row, i) => ({
      contractor_name: row.contractor_name || '',
      categories: row.categories ? row.categories.split(',').filter(Boolean) : [],
      contractor_phone: row.contractor_phone || '',
      contractor_email: row.contractor_email || '',
      service_areas: contractors[i]?.service_areas || [], // Preserve existing
    }))
    onChange(updated)
  }

  const handleCsvParsed = (csvRows: Record<string, string>[]) => {
    const newContractors: ContractorEntry[] = csvRows.map((row) => {
      // Match categories against known list (case-insensitive, supports comma-separated)
      let categories: string[] = []
      const rawCats = row.category || row.categories || ''
      if (rawCats) {
        const parsed = rawCats.split(',').map((c) => c.trim()).filter(Boolean)
        for (const c of parsed) {
          const match = CATEGORY_OPTIONS.find((opt) => opt.value.toLowerCase() === c.toLowerCase())
          if (match) categories.push(match.value)
        }
      }

      // Parse service_areas from CSV (comma-separated)
      let service_areas: string[] = []
      if (row.service_areas) {
        const parsed = row.service_areas.split(',').map((s) => s.trim()).filter(Boolean)
        // Match against available cities (case-insensitive)
        service_areas = parsed
          .map((p) => availableCities.find((c) => c.toLowerCase() === p.toLowerCase()))
          .filter((c): c is string => c !== undefined)
      }

      return {
        contractor_name: row.contractor_name || '',
        categories,
        contractor_phone: row.contractor_phone || '',
        contractor_email: row.contractor_email || '',
        service_areas,
      }
    })
    onChange([...contractors.filter((c) => c.contractor_name), ...newContractors])
  }

  const openCityModal = (idx: number) => {
    const contractor = contractors[idx]
    setSelectedCities(contractor.service_areas || [])
    setEditingIdx(idx)
  }

  const saveServiceAreas = () => {
    if (editingIdx === null) return
    const updated = [...contractors]
    updated[editingIdx] = {
      ...updated[editingIdx],
      service_areas: selectedCities,
    }
    onChange(updated)
    setEditingIdx(null)
  }

  const toggleCity = (city: string) => {
    setSelectedCities((prev) =>
      prev.includes(city)
        ? prev.filter((c) => c !== city)
        : [...prev, city]
    )
  }

  const selectAllCities = () => {
    setSelectedCities([...availableCities])
  }

  const clearAllCities = () => {
    setSelectedCities([])
  }

  // Action column for service area assignment
  const actionColumn = availableCities.length > 0 ? {
    label: 'Service Areas',
    width: '15%',
    render: (rowIdx: number, row: Record<string, string>) => {
      // Only show for rows with a name
      if (!row.contractor_name?.trim()) {
        return <span className="text-xs text-muted-foreground">—</span>
      }
      const contractor = contractors[rowIdx]
      const areas = contractor?.service_areas || []
      const hasAreas = areas.length > 0

      return (
        <button
          type="button"
          onClick={() => openCityModal(rowIdx)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors w-full justify-between ${
            hasAreas
              ? 'border-border hover:border-primary/50 hover:bg-primary/5'
              : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
          }`}
        >
          <span className={hasAreas ? 'text-emerald-600 dark:text-emerald-400 font-medium truncate' : 'text-amber-600 dark:text-amber-400'}>
            {hasAreas ? areas.join(', ') : 'None'}
          </span>
          <Pencil className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        </button>
      )
    },
  } : undefined

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Contractors</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add your contractors with their category and contact info.
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
        templateFilename="contractors_template.csv"
        exampleRows={[
          {
            contractor_name: 'QuickFix Plumbing Ltd',
            categories: 'Plumber, General / Handyman',
            contractor_phone: '07700 900100',
            contractor_email: 'info@quickfix-demo.co.uk',
            service_areas: 'Manchester, Salford',
          },
          {
            contractor_name: 'Spark Electrical',
            categories: 'Electrician',
            contractor_phone: '07700 900200',
            contractor_email: 'jobs@spark-demo.co.uk',
            service_areas: 'Manchester',
          },
          {
            contractor_name: 'SafeGas Services',
            categories: 'Gas, Boiler Engineer',
            contractor_phone: '07700 900300',
            contractor_email: 'hello@safegas-demo.co.uk',
            service_areas: 'Bolton',
          },
          {
            contractor_name: 'AllTrades Maintenance',
            categories: 'Joiner, Locksmith',
            contractor_phone: '07700 900400',
            contractor_email: 'team@alltrades-demo.co.uk',
            service_areas: 'Bury',
          },
          {
            contractor_name: 'CleanPest Solutions',
            categories: 'Pest Control, Cleaning',
            contractor_phone: '07700 900500',
            contractor_email: 'info@cleanpest-demo.co.uk',
            service_areas: 'Stockport',
          },
          {
            contractor_name: 'TopCoat Decorators',
            categories: 'Decorator',
            contractor_phone: '07700 900600',
            contractor_email: 'quote@topcoat-demo.co.uk',
            service_areas: 'Manchester, Salford',
          },
          {
            contractor_name: 'RoofRight Ltd',
            categories: 'Roofing / Guttering, Window Specialist',
            contractor_phone: '07700 900700',
            contractor_email: 'jobs@roofright-demo.co.uk',
            service_areas: 'Manchester',
          },
          {
            contractor_name: 'DrainPro Services',
            categories: 'Drainage',
            contractor_phone: '07700 900800',
            contractor_email: 'info@drainpro-demo.co.uk',
            service_areas: 'Salford, Bolton',
          },
          {
            contractor_name: 'GreenThumb Gardens',
            categories: 'Gardener',
            contractor_phone: '07700 900900',
            contractor_email: 'hello@greenthumb-demo.co.uk',
            service_areas: 'Bury, Stockport',
          },
          {
            contractor_name: 'FixIt Appliances',
            categories: 'Appliance Engineer',
            contractor_phone: '07700 901000',
            contractor_email: 'repair@fixit-demo.co.uk',
            service_areas: 'Manchester',
          },
        ]}
      />

      {/* CSV Categories Tip */}
      <div className="flex gap-3 p-4 bg-muted/30 border border-border rounded-lg">
        <Pencil className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground">
            Categories in CSV
          </p>
          <p className="text-muted-foreground mt-1">
            Use comma-separated values for multiple categories, e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">Plumber, General / Handyman</code>.
            Categories must match exactly (case-insensitive):
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CONTRACTOR_CATEGORIES.map((cat) => (
              <span key={cat} className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-foreground text-xs">
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Service Area Assignment Explanation */}
      <div className="flex gap-3 p-4 bg-muted/30 border border-border rounded-lg">
        <MapPin className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm space-y-2">
          <p className="font-medium text-foreground">
            Service Area Assignment
          </p>
          <p className="text-muted-foreground">
            We&apos;ve extracted cities from your property postcodes. Assign each contractor to the cities they serve.
          </p>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>CSV:</strong> Include &quot;service_areas&quot; column (comma-separated: &quot;Manchester, Salford&quot;)</li>
            <li><strong>UI:</strong> Click Service Areas column to select cities</li>
            <li>Contractors are auto-assigned to <strong>all properties</strong> in their selected cities</li>
            <li><strong>No selection = no automatic assignment</strong> (you can assign manually later)</li>
          </ul>
          {availableCities.length > 0 && (
            <p className="text-muted-foreground pt-1">
              <strong>Cities from your properties:</strong>{' '}
              {availableCities.map((city, i) => (
                <span key={city} className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-foreground text-xs mr-1.5 mb-1">
                  {city}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* Service Area Modal */}
      <Dialog open={editingIdx !== null} onOpenChange={(open) => !open && setEditingIdx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Service Areas — {editingIdx !== null ? contractors[editingIdx]?.contractor_name : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select which cities this contractor serves. They&apos;ll be auto-assigned to all properties in those cities.
            </p>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllCities}
                className="flex-1"
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearAllCities}
                className="flex-1"
              >
                Clear All
              </Button>
            </div>

            <div className="border-t pt-4 space-y-2 max-h-64 overflow-y-auto">
              {availableCities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No cities found. Add properties with valid UK postcodes first.
                </p>
              ) : (
                availableCities.map((city) => {
                  const isSelected = selectedCities.includes(city)
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => toggleCity(city)}
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
                      <span>{city}</span>
                    </button>
                  )
                })
              )}
            </div>

            {selectedCities.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
                No cities selected — this contractor won&apos;t be auto-assigned to any properties.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingIdx(null)}>
              Cancel
            </Button>
            <Button onClick={saveServiceAreas}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
