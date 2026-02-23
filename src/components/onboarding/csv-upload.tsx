'use client'

import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, Download } from 'lucide-react'

interface CsvUploadProps {
  expectedColumns: string[]
  onParsed: (rows: Record<string, string>[]) => void
  templateFilename: string
  exampleRows?: Record<string, string>[]
}

function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

export function CsvUpload({ expectedColumns, onParsed, templateFilename, exampleRows }: CsvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter((line) => line.trim())

      if (lines.length < 2) {
        alert('CSV file must have headers and at least one data row')
        return
      }

      const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase())

      // Validate headers match expected columns (case-insensitive)
      const normalizedExpected = expectedColumns.map((c) => c.toLowerCase().replace(/[_\s-]/g, ''))
      const unrecognized = headers.filter((h) => {
        const normalized = h.replace(/[_\s-]/g, '')
        return !normalizedExpected.includes(normalized)
      })

      if (unrecognized.length > 0) {
        alert(
          `Column(s) not recognized: "${unrecognized.join('", "')}". ` +
          `Please use the template or rename to match: ${expectedColumns.join(', ')}`
        )
        return
      }

      // Map headers to expected column names
      const headerMapping: Record<number, string> = {}
      headers.forEach((h, idx) => {
        const normalized = h.replace(/[_\s-]/g, '')
        const matchedCol = expectedColumns.find(
          (c) => c.toLowerCase().replace(/[_\s-]/g, '') === normalized
        )
        if (matchedCol) {
          headerMapping[idx] = matchedCol
        }
      })

      // Parse data rows
      const rows: Record<string, string>[] = []
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i])
        const row: Record<string, string> = {}
        expectedColumns.forEach((col) => { row[col] = '' })

        values.forEach((val, idx) => {
          if (headerMapping[idx]) {
            row[headerMapping[idx]] = val.trim()
          }
        })

        // Only add if row has some data
        if (Object.values(row).some((v) => v)) {
          rows.push(row)
        }
      }

      onParsed(rows)
    }
    reader.readAsText(file)

    // Reset input so same file can be re-uploaded
    event.target.value = ''
  }, [expectedColumns, onParsed])

  const downloadTemplate = () => {
    let csvContent = expectedColumns.join(',') + '\n'
    if (exampleRows && exampleRows.length > 0) {
      exampleRows.forEach((row) => {
        csvContent += expectedColumns.map((col) => {
          const val = row[col] || ''
          return val.includes(',') ? `"${val}"` : val
        }).join(',') + '\n'
      })
    }
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = templateFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
        ref={inputRef}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" />
        Upload CSV
      </Button>
      <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-1.5">
        <Download className="h-3.5 w-3.5" />
        Download Template
      </Button>
    </div>
  )
}
