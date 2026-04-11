'use client'

import { format, differenceInDays } from 'date-fns'
import { ExternalLink, Play, CheckCircle, XCircle, Wrench } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency, getMediaUrls } from '@/hooks/use-ticket-detail'
import type { TicketDetail, CompletionData } from '@/hooks/use-ticket-detail'
import { cn } from '@/lib/utils'

// --- Shared sub-components ---

function ExpiryLabel({ expiryDate }: { expiryDate: string }) {
  const expiry = new Date(expiryDate)
  const daysUntil = differenceInDays(expiry, new Date())
  const formatted = format(expiry, 'd MMM yyyy')

  if (daysUntil < 0) return (
    <div className="text-right">
      <span className="text-sm font-semibold text-danger">{formatted}</span>
      <p className="text-[11px] text-danger/70">Expired {Math.abs(daysUntil)} days ago</p>
    </div>
  )
  if (daysUntil <= 30) return (
    <div className="text-right">
      <span className="text-sm font-semibold text-warning">{formatted}</span>
      <p className="text-[11px] text-warning/70">Expires in {daysUntil} days</p>
    </div>
  )
  return <span className="text-sm text-card-foreground">{formatted}</span>
}

const LEDGER_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  paid: { bg: 'bg-success/10', text: 'text-success' },
  overdue: { bg: 'bg-danger/10', text: 'text-danger' },
  partial: { bg: 'bg-warning/10', text: 'text-warning' },
  pending: { bg: 'bg-muted', text: 'text-muted-foreground' },
}

function LedgerStatusBadge({ status }: { status: string }) {
  const style = LEDGER_STATUS_STYLES[status] || LEDGER_STATUS_STYLES.pending
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text} capitalize`}>
      {status}
    </span>
  )
}

// --- Category sections ---

interface CategoryDataProps {
  category: string
  ticket: TicketDetail
  completion: CompletionData | null
}

export function CategoryData({ category, ticket, completion }: CategoryDataProps) {
  if (category === 'compliance_renewal') return <ComplianceSection ticket={ticket} />
  if (category === 'rent_arrears') return <RentSection ticket={ticket} />
  return <MaintenanceSection ticket={ticket} completion={completion} />
}

// --- Maintenance ---

function MaintenanceSection({ ticket, completion }: {
  ticket: TicketDetail; completion: CompletionData | null
}) {
  const images = (ticket.images || []) as string[]
  const markup = ticket.final_amount != null && ticket.contractor_quote != null
    ? ticket.final_amount - ticket.contractor_quote : null
  const autoApproveLimit = ticket.auto_approve_limit

  return (
    <>
      {/* Job Details */}
      {(ticket.contractor_quote != null || ticket.scheduled_date) && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Job Details</p>
          <div className="space-y-3">
            {ticket.contractor_quote != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Quote</span>
                <span className="text-sm font-semibold text-card-foreground font-mono">{formatCurrency(ticket.contractor_quote)}</span>
              </div>
            )}
            {markup != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Markup</span>
                <span className="text-sm font-semibold text-card-foreground font-mono">{formatCurrency(markup)}</span>
              </div>
            )}
            {ticket.final_amount != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Final Amount</span>
                <span className="text-base font-bold text-card-foreground font-mono">{formatCurrency(ticket.final_amount)}</span>
              </div>
            )}
            {ticket.contractor_quote && autoApproveLimit != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Approval</span>
                {ticket.contractor_quote <= autoApproveLimit ? (
                  <span className="text-sm text-success font-semibold">Within limit ({formatCurrency(autoApproveLimit)})</span>
                ) : (
                  <span className="text-sm text-warning font-semibold">Requires landlord · limit {formatCurrency(autoApproveLimit)}</span>
                )}
              </div>
            )}
            {ticket.scheduled_date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Scheduled</span>
                <span className="text-sm font-semibold text-card-foreground">
                  {format(new Date(ticket.scheduled_date), 'd MMM yyyy')}
                  {(() => {
                    const h = new Date(ticket.scheduled_date).getHours()
                    const slot = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
                    return <span className="text-muted-foreground font-normal ml-1.5">· {slot}</span>
                  })()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completion (if exists) */}
      {completion && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Completion Report</p>
          <div className="flex items-center gap-3 mb-3">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border bg-transparent',
              completion.completed ? 'border-green-400 text-green-600' : 'border-red-400 text-red-600'
            )}>
              {completion.completed ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {completion.completed ? 'Completed' : 'Not Done'}
            </span>
            {completion.contractor_name && (
              <Link
                href={completion.contractor_id ? `/contractors?id=${completion.contractor_id}` : '#'}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Wrench className="h-3.5 w-3.5" />{completion.contractor_name}
              </Link>
            )}
          </div>
          {completion.total_amount != null && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-sm font-bold font-mono">{formatCurrency(completion.total_amount)}</span>
            </div>
          )}
          {(completion.notes || completion.completion_text) && (
            <div className="bg-muted/30 rounded-lg p-3 mt-2">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{completion.notes || completion.completion_text}</p>
            </div>
          )}
          {!completion.completed && completion.reason && (
            <div className="bg-red-500/5 rounded-lg p-3 mt-2">
              <p className="text-sm text-destructive leading-relaxed">{completion.reason}</p>
            </div>
          )}
          {(() => {
            const mediaUrls = getMediaUrls(completion.media_urls)
            if (mediaUrls.length === 0) return null
            return (
              <div className="grid grid-cols-3 gap-1.5 mt-3">
                {mediaUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block group">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-16 object-cover rounded border group-hover:opacity-80 transition-opacity" />
                  </a>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* Media */}
      {images.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Media ({images.length})</p>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {images.map((url, index) => {
              const isVideo = /\.(mp4|mov|webm|avi|mkv|3gp)/i.test(url) || url.includes('/video/')
              return isVideo ? (
                <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="block group relative">
                  <video src={url} preload="metadata" muted playsInline className="w-full h-20 object-cover rounded-lg border group-hover:opacity-80 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-foreground/70 flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 text-background fill-background ml-0.5" />
                    </div>
                  </div>
                </a>
              ) : (
                <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="block group">
                  <img src={url} alt={`Photo ${index + 1}`} className="w-full h-20 object-cover rounded-lg border group-hover:opacity-80 transition-opacity" />
                </a>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

// --- Compliance ---

function ComplianceSection({ ticket }: { ticket: TicketDetail }) {
  const cert = ticket.compliance
  if (!cert) return null

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Certificate</p>
        {cert.cert_id && (
          <Link href={`/compliance/${cert.cert_id}`} className="text-muted-foreground hover:text-foreground transition-colors" title="View certificate">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {cert.expiry_date && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Expiry</span>
            <ExpiryLabel expiryDate={cert.expiry_date} />
          </div>
        )}
        {cert.status && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <StatusBadge status={cert.status} size="md" />
          </div>
        )}
        {cert.issued_date && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last issued</span>
            <span className="text-sm text-card-foreground">{format(new Date(cert.issued_date), 'd MMM yyyy')}</span>
          </div>
        )}
        {cert.certificate_number && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cert #</span>
            <span className="text-sm text-card-foreground font-mono">{cert.certificate_number}</span>
          </div>
        )}
        {cert.issued_by && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Issued by</span>
            <span className="text-sm text-card-foreground">{cert.issued_by}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Document</span>
          {cert.document_url ? (
            <a href={cert.document_url} target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary hover:text-primary/70 flex items-center gap-1 transition-colors font-semibold">
              View <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-sm text-muted-foreground/60">Not uploaded</span>
          )}
        </div>
        {ticket.scheduled_date && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <span className="text-sm text-muted-foreground">Renewal scheduled</span>
            <span className="text-sm font-semibold text-card-foreground">{format(new Date(ticket.scheduled_date), 'd MMM yyyy')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Rent ---

function RentSection({ ticket }: { ticket: TicketDetail }) {
  const rentLedger = ticket.rent_ledger || []
  const overdueRows = rentLedger.filter(r => r.status === 'overdue' || r.status === 'partial')
  const totalArrears = overdueRows.reduce((sum, r) => sum + r.amount_due - (r.amount_paid || 0), 0)
  const monthsOverdue = rentLedger.filter(r => r.status === 'overdue').length
  const partialCount = rentLedger.filter(r => r.status === 'partial').length

  return (
    <>
      {/* Arrears Summary */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Arrears Summary</p>
        <div className="rounded-lg border border-border px-4 py-4 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Outstanding</p>
            <p className={`text-2xl font-bold font-mono ${totalArrears > 0 ? 'text-danger' : 'text-success'}`}>
              {formatCurrency(totalArrears) === '-' ? '£0.00' : formatCurrency(totalArrears)}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {overdueRows.length > 0 && (() => {
              const earliestDue = overdueRows
                .map(r => new Date(r.due_date))
                .sort((a, b) => a.getTime() - b.getTime())[0]
              const daysOverdue = differenceInDays(new Date(), earliestDue)
              return <span className="text-danger">{daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue</span>
            })()}
            {partialCount > 0 && <span className="text-warning">{partialCount} partial payment{partialCount !== 1 ? 's' : ''}</span>}
            {totalArrears === 0 && <span className="text-success">Arrears cleared</span>}
          </div>
        </div>
      </div>

      {/* Payment Ledger */}
      {rentLedger.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payment Ledger</p>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-1">
              <span>Month</span><span className="text-right">Due</span><span className="text-right">Paid</span><span className="text-right">Status</span>
            </div>
            {rentLedger.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_80px_80px_80px] gap-2 items-center py-1.5 border-t border-border/20">
                <span className="text-sm text-foreground">{format(new Date(row.due_date), 'MMM yyyy')}</span>
                <span className="text-sm text-foreground text-right font-mono">{formatCurrency(row.amount_due)}</span>
                <span className="text-sm text-foreground text-right font-mono">{formatCurrency(row.amount_paid)}</span>
                <div className="flex justify-end"><LedgerStatusBadge status={row.status} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
