'use client'

import { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { Plus, Trash2 } from 'lucide-react'

export interface ColumnDef {
  key: string
  label: string
  required?: boolean
  type?: 'text' | 'select' | 'combobox' | 'number'
  options?: { value: string; label: string }[]
  placeholder?: string
  width?: string
}

interface EditableTableProps {
  columns: ColumnDef[]
  rows: Record<string, string>[]
  onChange: (rows: Record<string, string>[]) => void
  minRows?: number
  highlightEmptySelections?: boolean
}

export function EditableTable({ columns, rows, onChange, minRows = 1, highlightEmptySelections = false }: EditableTableProps) {
  // Check if row has empty selection fields (combobox or select)
  const rowNeedsAttention = (row: Record<string, string>) => {
    if (!highlightEmptySelections) return false
    return columns.some(col =>
      (col.type === 'combobox' || col.type === 'select') &&
      col.options &&
      col.options.length > 0 &&
      !row[col.key]
    )
  }
  const addRow = () => {
    const newRow: Record<string, string> = {}
    columns.forEach((col) => {
      newRow[col.key] = ''
    })
    onChange([...rows, newRow])
  }

  const removeRow = (index: number) => {
    if (rows.length <= minRows) return
    onChange(rows.filter((_, i) => i !== index))
  }

  const updateCell = (rowIndex: number, key: string, value: string) => {
    const updated = [...rows]
    updated[rowIndex] = { ...updated[rowIndex], [key]: value }
    onChange(updated)
  }

  // Handle paste from spreadsheet (tab-separated values)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return // Not a table paste

    e.preventDefault()
    const pastedRows = text.split('\n').filter((line) => line.trim())
    const newRows = [...rows]

    pastedRows.forEach((line, lineIdx) => {
      const values = line.split('\t')
      const targetRowIdx = rowIndex + lineIdx

      // Add new rows if needed
      while (newRows.length <= targetRowIdx) {
        const newRow: Record<string, string> = {}
        columns.forEach((col) => { newRow[col.key] = '' })
        newRows.push(newRow)
      }

      values.forEach((val, valIdx) => {
        const targetColIdx = colIndex + valIdx
        if (targetColIdx < columns.length) {
          newRows[targetRowIdx] = {
            ...newRows[targetRowIdx],
            [columns[targetColIdx].key]: val.trim(),
          }
        }
      })
    })

    onChange(newRows)
  }, [rows, columns, onChange])

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-3 py-2 font-medium text-muted-foreground"
                  style={{ width: col.width }}
                >
                  {col.label}
                  {col.required && <span className="text-destructive ml-0.5">*</span>}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className={`border-b last:border-b-0 ${rowNeedsAttention(row) ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                {columns.map((col, colIdx) => (
                  <td key={col.key} className="px-2 py-1.5">
                    {col.type === 'combobox' && col.options ? (
                      <Combobox
                        options={col.options}
                        value={row[col.key] || ''}
                        onValueChange={(v) => updateCell(rowIdx, col.key, v)}
                        placeholder={col.placeholder || 'Search...'}
                        searchPlaceholder="Type to search..."
                        emptyText="No matches"
                        className="h-8 text-sm border-0 shadow-none bg-transparent"
                      />
                    ) : col.type === 'select' && col.options ? (
                      <Select
                        value={row[col.key] || ''}
                        onValueChange={(v) => updateCell(rowIdx, col.key, v)}
                      >
                        <SelectTrigger className="h-8 text-sm border-0 shadow-none bg-transparent focus:ring-1">
                          <SelectValue placeholder={col.placeholder || 'Select...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {col.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={col.type === 'number' ? 'number' : 'text'}
                        value={row[col.key] || ''}
                        onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
                        onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                        placeholder={col.placeholder}
                        className="h-8 text-sm border-0 shadow-none bg-transparent focus:ring-1"
                      />
                    )}
                  </td>
                ))}
                <td className="px-1 py-1.5">
                  <button
                    type="button"
                    onClick={() => removeRow(rowIdx)}
                    className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                    disabled={rows.length <= minRows}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Add Row
      </Button>
    </div>
  )
}
