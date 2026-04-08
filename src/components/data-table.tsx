'use client'

import { useState, useMemo, ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ArrowUpDown, ArrowUp, ArrowDown, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: string
  sortable?: boolean
  width?: string
  render?: (row: T) => React.ReactNode
  getValue?: (row: T) => string | number | null
}

type DataTableProps<T> = {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
  onViewClick?: (row: T) => void
  getRowId: (row: T) => string
  getRowClassName?: (row: T) => string
  emptyMessage?: ReactNode
  loading?: boolean
  maxHeight?: string
  fillHeight?: boolean
  showHeader?: boolean      // default true — set false to hide column headers (e.g. 2nd+ sections)
  disableBodyScroll?: boolean // default false — set true for overflow-visible (inside parent scroller)
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  onViewClick,
  getRowId,
  getRowClassName,
  emptyMessage = 'No data found',
  loading = false,
  maxHeight = 'calc(100vh - 280px)',
  fillHeight = false,
  showHeader = true,
  disableBodyScroll = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return data

    const result = [...data]
    const col = columns.find((c) => c.key === sortKey)
    result.sort((a, b) => {
      let aVal = col?.getValue ? col.getValue(a) : (a as Record<string, unknown>)[sortKey]
      let bVal = col?.getValue ? col.getValue(b) : (b as Record<string, unknown>)[sortKey]

      if (aVal === null || aVal === undefined) aVal = ''
      if (bVal === null || bVal === undefined) bVal = ''

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }

      return 0
    })

    return result
  }, [data, sortKey, sortDir, columns])

  if (loading) {
    return (
      <div className={cn("bg-card rounded-xl border border-border overflow-hidden", fillHeight && "flex flex-col flex-1 min-h-0 h-full")}>
        <div className={cn("space-y-1 px-5 pt-4", fillHeight && "flex-1 min-h-0 overflow-hidden")}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="py-4">
              <div className="h-5 w-full bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("bg-card rounded-xl border border-border overflow-hidden", fillHeight && "flex flex-col flex-1 min-h-0 h-full")}>
      {/* Table */}
      <div
        className={cn(disableBodyScroll ? "overflow-visible" : "overflow-auto", fillHeight && "flex-1 min-h-0")}
        style={!disableBodyScroll && !fillHeight ? { maxHeight } : undefined}
      >
        <Table>
          {showHeader && (
            <TableHeader className="[&_tr]:border-b [&_tr]:border-border/60 sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    style={{ width: col.width }}
                    className={cn(
                      'h-10 px-5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider',
                      col.sortable && 'cursor-pointer select-none hover:text-foreground'
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className="ml-1">
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
                {onViewClick && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
          )}
          <TableBody className="[&_tr]:border-b [&_tr]:border-border/40 [&_tr:last-child]:border-0">
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (onViewClick ? 1 : 0)}
                  className="h-32 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  className={cn(
                    'group',
                    onRowClick && 'cursor-pointer hover:bg-muted/50',
                    getRowClassName?.(row)
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className="py-4 px-5">
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '-')}
                    </TableCell>
                  ))}
                  {onViewClick && (
                    <TableCell className="py-4 px-5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewClick(row)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className={cn("px-5 py-3 text-xs text-muted-foreground/60 border-t border-border/30", fillHeight && "flex-shrink-0")}>
        {data.length} results
      </div>
    </div>
  )
}
