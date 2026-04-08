/**
 * CSV/data export utilities for Yarro PM.
 * Generates CSV strings and triggers browser downloads.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export interface ExportColumn {
  key: string
  header: string
  format?: (value: unknown, row: Row) => string
}

/**
 * Convert an array of objects to a CSV string.
 * Handles quoting fields that contain commas, quotes, or newlines.
 */
export function toCSV(data: Row[], columns: ExportColumn[]): string {
  const escape = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const headerRow = columns.map((c) => escape(c.header)).join(',')

  const dataRows = data.map((row) =>
    columns
      .map((col) => {
        if (col.format) return escape(col.format(row[col.key], row))
        const val = row[col.key]
        if (val === null || val === undefined) return ''
        return escape(String(val))
      })
      .join(',')
  )

  return [headerRow, ...dataRows].join('\n')
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * One-shot: convert data to CSV and download.
 */
export function exportToCSV(
  data: Row[],
  columns: ExportColumn[],
  filename: string
) {
  const csv = toCSV(data, columns)
  downloadCSV(csv, filename)
}

// ─────────────────────────────────────────────────────────
// Pre-built export configs for common entities
// ─────────────────────────────────────────────────────────

export const PROPERTY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'address', header: 'Address' },
  { key: 'property_type', header: 'Type' },
  { key: 'landlord_name', header: 'Landlord' },
  { key: 'landlord_phone', header: 'Landlord Phone' },
  { key: 'landlord_email', header: 'Landlord Email' },
  { key: 'total_rooms', header: 'Total Rooms' },
  { key: 'occupied_rooms', header: 'Occupied Rooms' },
]

export const TENANT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'full_name', header: 'Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'email', header: 'Email' },
  { key: 'address', header: 'Property' },
  { key: 'role_tag', header: 'Role' },
]
