'use client'

import Link from 'next/link'
import { ArrowLeft, Download, FileText, Table } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/audit-utils'
import type { TicketBasic } from '@/hooks/use-ticket-audit'

interface AuditProfileHeaderProps {
  ticket: TicketBasic
  onExportPDF: () => void
  onExportCSV: () => void
  exportingPDF?: boolean
}

export function AuditProfileHeader({ ticket, onExportPDF, onExportCSV, exportingPDF }: AuditProfileHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/audit-trail"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Audit Trail
      </Link>

      {/* Header card */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {ticket.issue_description || 'Untitled Ticket'}
            </h1>
            {ticket.address && (
              <p className="text-sm text-muted-foreground mt-1">{ticket.address}</p>
            )}

            {/* Badges */}
            <div className="flex items-center gap-2 mt-3">
              <StatusBadge status={ticket.status} size="sm" />
              {ticket.priority && <StatusBadge status={ticket.priority} size="sm" />}
              {ticket.category && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {ticket.category}
                </span>
              )}
            </div>

            {/* Key dates */}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>Logged: {formatDate(ticket.date_logged)}</span>
              {ticket.sla_due_at && <span>SLA: {formatDate(ticket.sla_due_at)}</span>}
              {ticket.resolved_at && <span>Resolved: {formatDate(ticket.resolved_at)}</span>}
            </div>
          </div>

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportPDF} disabled={exportingPDF}>
                <FileText className="h-4 w-4 mr-2" />
                {exportingPDF ? 'Generating PDF...' : 'Export as PDF'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCSV}>
                <Table className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
