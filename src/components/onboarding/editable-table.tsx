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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Combobox } from '@/components/ui/combobox'
import { Plus, Trash2, Check, ChevronDown } from 'lucide-react'

export interface ColumnDef {
  key: string
  label: string
  required?: boolean
  type?: 'text' | 'select' | 'combobox' | 'number' | 'multiselect'
  options?: { value: string; label: string }[]
  placeholder?: string
  width?: string
}

interface ActionColumnDef {
  label: string
  width?: string
  render: (rowIndex: number, row: Record<string, string>) => React.ReactNode
}

interface EditableTableProps {
  columns: ColumnDef[]
  rows: Record<string, string>[]
  onChange: (rows: Record<string, string>[]) => void
  minRows?: number
  highlightEmptySelections?: boolean
  actionColumn?: ActionColumnDef
}

export function EditableTable({ columns, rows, onChange, minRows = 1, highlightEmptySelections = false, actionColumn }: EditableTableProps) {
  // Check if row has empty selection fields (combobox or select)
  const rowNeedsAttention = (row: Record<string, string>) => {
    if (!highlightEmptySelections) return false
    return columns.some(col =>
      (col.type === 'combobox' || col.type === 'select' || col.type === 'multiselect') &&
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
      <div className="border rounded-lg overflow-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
            <tr className="border-b">
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
              {actionColumn && (
                <th
                  className="text-left px-3 py-2 font-medium text-muted-foreground border-l border-border"
                  style={{ width: actionColumn.width }}
                >
                  {actionColumn.label}
                </th>
              )}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className={`border-b last:border-b-0 ${rowNeedsAttention(row) ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                {columns.map((col, colIdx) => (
                  <td key={col.key} className="px-2 py-1.5">
                    {col.type === 'multiselect' && col.options ? (() => {
                      const selected = row[col.key] ? row[col.key].split(',').filter(Boolean) : []
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center justify-between w-full h-8 px-2 text-sm rounded bg-transparent hover:bg-muted/50 transition-colors text-left"
                            >
                              <span className={selected.length > 0 ? 'truncate' : 'text-muted-foreground truncate'}>
                                {selected.length > 0
                                  ? selected.map(v => col.options!.find(o => o.value === v)?.label || v).join(', ')
                                  : col.placeholder || 'Select...'}
                              </span>
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-1" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-1.5 max-h-64 overflow-y-auto" align="start">
                            {col.options.map((opt) => {
                              const isSelected = selected.includes(opt.value)
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    const newSelected = isSelected
                                      ? selected.filter(v => v !== opt.value)
                                      : [...selected, opt.value]
                                    updateCell(rowIdx, col.key, newSelected.join(','))
                                  }}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left"
                                >
                                  <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                    isSelected ? 'bg-primary border-primary' : 'border-input'
                                  }`}>
                                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                  </div>
                                  <span>{opt.label}</span>
                                </button>
                              )
                            })}
                          </PopoverContent>
                        </Popover>
                      )
                    })() : col.type === 'combobox' && col.options ? (
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
                {actionColumn && (
                  <td className="px-2 py-1.5 border-l border-border">
                    {actionColumn.render(rowIdx, row)}
                  </td>
                )}
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
