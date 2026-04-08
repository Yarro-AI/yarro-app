'use client'

import { format, differenceInDays } from 'date-fns'
import { Users, Crown, Wrench, FileText, ExternalLink, CalendarClock } from 'lucide-react'
import Link from 'next/link'
import type { TicketContext, TicketBasic, ComplianceCertData } from '@/hooks/use-ticket-detail'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import { StatusBadge } from '@/components/status-badge'

interface ComplianceOverviewTabProps {
  context: TicketContext
  basic: TicketBasic
  cert: ComplianceCertData | null
  loading: boolean
}

function ExpiryLabel({ expiryDate }: { expiryDate: string }) {
  const expiry = new Date(expiryDate)
  const daysUntil = differenceInDays(expiry, new Date())
  const formatted = format(expiry, 'd MMM yyyy')

  if (daysUntil < 0) {
    return <span className="text-sm font-medium text-danger">Expired {formatted} ({Math.abs(daysUntil)}d ago)</span>
  }
  if (daysUntil <= 30) {
    return <span className="text-sm font-medium text-warning">Expires {formatted} ({daysUntil}d)</span>
  }
  return <span className="text-sm font-medium text-success">{formatted}</span>
}

export function ComplianceOverviewTab({ context, basic, cert, loading }: ComplianceOverviewTabProps) {
  const images = basic.images || []

  return (
    <div>
      {/* ── Section 1: Status ── */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {basic.next_action_reason && <StatusBadge status={basic.next_action_reason} size="md" />}
          {basic.priority && <StatusBadge status={basic.priority} size="md" />}
          {cert?.status && <StatusBadge status={cert.status} size="md" />}
        </div>
        <p className="text-xs text-muted-foreground">
          {basic.date_logged && `Logged ${format(new Date(basic.date_logged), 'd MMM yyyy')}`}
        </p>
      </div>

      {/* ── Section 2: Certificate Details ── */}
      <div className="border-t border-border/40" />
      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-foreground mb-3">Certificate</p>

        {loading && !cert ? (
          <div className="space-y-2">
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-36 bg-muted animate-pulse rounded" />
            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
          </div>
        ) : !cert ? (
          <p className="text-sm text-muted-foreground">No certificate linked to this ticket.</p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Type</span>
              <span className="text-sm font-medium text-foreground">
                {CERTIFICATE_LABELS[cert.certificate_type as CertificateType] || cert.certificate_type}
              </span>
            </div>
            {cert.expiry_date && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Expiry</span>
                <ExpiryLabel expiryDate={cert.expiry_date} />
              </div>
            )}
            {cert.issued_date && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Issued</span>
                <span className="text-sm text-foreground">{format(new Date(cert.issued_date), 'd MMM yyyy')}</span>
              </div>
            )}
            {cert.certificate_number && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Cert #</span>
                <span className="text-sm text-foreground font-mono">{cert.certificate_number}</span>
              </div>
            )}
            {cert.issued_by && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Issued by</span>
                <span className="text-sm text-foreground">{cert.issued_by}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Document</span>
              {cert.document_url ? (
                <a
                  href={cert.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-primary/70 flex items-center gap-1 transition-colors"
                >
                  View <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">No document uploaded</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: People ── */}
      <div className="border-t border-border/40" />
      <div className="px-6 py-5">
        <div className="flex items-center gap-4 flex-wrap">
          {context.tenant_name && (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm text-foreground">{context.tenant_name}</span>
            </div>
          )}
          {context.landlord_name && context.landlord_id && (
            <Link href={`/landlords/${context.landlord_id}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
              <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
                <Crown className="h-3.5 w-3.5 text-warning" />
              </div>
              <span className="text-sm text-foreground">{context.landlord_name}</span>
            </Link>
          )}
          {cert?.contractor_name && cert.contractor_id && (
            <Link href={`/contractors/${cert.contractor_id}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
              <div className="h-7 w-7 rounded-md bg-success/10 flex items-center justify-center">
                <Wrench className="h-3.5 w-3.5 text-success" />
              </div>
              <span className="text-sm text-foreground">{cert.contractor_name}</span>
            </Link>
          )}
        </div>
      </div>

      {/* ── Section 4: Job Progress (conditional) ── */}
      {(basic.job_stage || basic.scheduled_date) && (
        <>
          <div className="border-t border-border/40" />
          <div className="px-6 py-5">
            <p className="text-sm font-semibold text-foreground mb-3">Job Progress</p>
            <div className="space-y-2">
              {basic.job_stage && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Stage</span>
                  <StatusBadge status={basic.job_stage} />
                </div>
              )}
              {basic.scheduled_date && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Scheduled</span>
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">{format(new Date(basic.scheduled_date), 'd MMM yyyy')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Section 5: Media (conditional) ── */}
      {images.length > 0 && (
        <>
          <div className="border-t border-border/40" />
          <div className="px-6 py-5">
            <p className="text-sm font-semibold text-foreground mb-3">Media</p>
            <div className="grid grid-cols-3 gap-2">
              {images.map((url, i) => {
                const isVideo = /\.(mp4|mov|webm)$/i.test(url)
                return isVideo ? (
                  <video key={i} src={url} className="rounded-md w-full aspect-square object-cover" muted />
                ) : (
                  <img key={i} src={url} alt="" className="rounded-md w-full aspect-square object-cover" />
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
