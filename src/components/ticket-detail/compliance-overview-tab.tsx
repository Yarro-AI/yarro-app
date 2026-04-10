'use client'

import { format, differenceInDays, formatDistanceToNow } from 'date-fns'
import { Crown, Wrench, ExternalLink, Calendar, ShieldCheck, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import type { TicketContext, TicketBasic, ComplianceCertData } from '@/hooks/use-ticket-detail'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import { StatusBadge } from '@/components/status-badge'
import { cn } from '@/lib/utils'

function ExpiryLabel({ expiryDate }: { expiryDate: string }) {
  const expiry = new Date(expiryDate)
  const daysUntil = differenceInDays(expiry, new Date())
  const formatted = format(expiry, 'd MMM yyyy')

  if (daysUntil < 0) {
    return (
      <div>
        <p className="text-sm font-semibold text-danger">{formatted}</p>
        <p className="text-[11px] text-danger">Expired {Math.abs(daysUntil)} days ago</p>
      </div>
    )
  }
  if (daysUntil <= 30) {
    return (
      <div>
        <p className="text-sm font-semibold text-warning">{formatted}</p>
        <p className="text-[11px] text-warning">{daysUntil} days remaining</p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-sm font-semibold text-success">{formatted}</p>
      <p className="text-[11px] text-muted-foreground">{daysUntil} days remaining</p>
    </div>
  )
}

// --- Stage Config ---

interface ComplianceStage {
  icon: typeof AlertTriangle
  iconBg: string
  iconColor: string
  title: string
  description: string
  cta?: { label: string; href?: string }
}

function getComplianceStage(basic: TicketBasic, cert: ComplianceCertData | null, context: TicketContext): ComplianceStage {
  const reason = basic.next_action_reason || ''
  const isExpired = cert?.expiry_date ? differenceInDays(new Date(cert.expiry_date), new Date()) < 0 : false
  const daysUntil = cert?.expiry_date ? differenceInDays(new Date(cert.expiry_date), new Date()) : null

  if (reason === 'cert_renewed' || reason === 'completed') {
    return {
      icon: CheckCircle2, iconBg: 'bg-success/10', iconColor: 'text-success',
      title: 'All renewed',
      description: "Certificate has been renewed. You're all good.",
    }
  }

  if (reason === 'scheduled') {
    return {
      icon: CalendarClock, iconBg: 'bg-primary/10', iconColor: 'text-primary',
      title: 'Renewal booked in',
      description: basic.scheduled_date
        ? `The contractor's coming on ${format(new Date(basic.scheduled_date), 'd MMM yyyy')} to do the renewal.`
        : 'A date has been booked for the renewal.',
    }
  }

  if (reason === 'awaiting_booking') {
    return {
      icon: CalendarClock, iconBg: 'bg-muted', iconColor: 'text-muted-foreground',
      title: 'Waiting for a date',
      description: "The contractor's accepted — just waiting for them to lock in a time.",
    }
  }

  if (reason === 'awaiting_contractor') {
    return {
      icon: Wrench, iconBg: 'bg-muted', iconColor: 'text-muted-foreground',
      title: 'Waiting on the contractor',
      description: "The renewal request has been sent out. Sitting tight until the contractor gets back.",
      cta: basic.compliance_certificate_id
        ? { label: 'View Certificate', href: `/compliance/${basic.compliance_certificate_id}` }
        : basic.contractor_id ? { label: 'Follow Up', href: `/contractors/${basic.contractor_id}` } : undefined,
    }
  }

  // compliance_needs_dispatch: ticket exists but no contractor dispatched yet
  if (reason === 'compliance_needs_dispatch') {
    const certId = basic.compliance_certificate_id
    if (isExpired) {
      return {
        icon: AlertTriangle, iconBg: 'bg-danger/10', iconColor: 'text-danger',
        title: 'Needs a contractor for renewal',
        description: `This certificate expired${daysUntil !== null ? ` ${Math.abs(daysUntil)} days ago` : ''}. The property is non-compliant until it's renewed — get a contractor dispatched.`,
        cta: certId ? { label: 'View Certificate', href: `/compliance/${certId}` } : undefined,
      }
    }
    return {
      icon: AlertTriangle, iconBg: 'bg-warning/10', iconColor: 'text-warning',
      title: 'Needs a contractor for renewal',
      description: daysUntil !== null
        ? `This cert expires in ${daysUntil} days. A renewal ticket's been created — now dispatch a contractor to get it sorted.`
        : 'A renewal ticket has been created. Dispatch a contractor to get it sorted.',
      cta: certId ? { label: 'View Certificate', href: `/compliance/${certId}` } : undefined,
    }
  }

  // Default: expired or expiring (no ticket context — shouldn't usually get here)
  if (isExpired) {
    const certId = basic.compliance_certificate_id
    return {
      icon: AlertTriangle, iconBg: 'bg-danger/10', iconColor: 'text-danger',
      title: 'This certificate has expired',
      description: `The property is non-compliant${daysUntil !== null ? ` — expired ${Math.abs(daysUntil)} days ago` : ''}. Get a renewal sorted as soon as possible.`,
      cta: certId ? { label: 'View Certificate', href: `/compliance/${certId}` } : undefined,
    }
  }

  if (daysUntil !== null && daysUntil <= 30) {
    const certId = basic.compliance_certificate_id
    return {
      icon: AlertTriangle, iconBg: 'bg-warning/10', iconColor: 'text-warning',
      title: 'Certificate expiring soon',
      description: `This cert expires in ${daysUntil} days. Time to get a contractor booked in for the renewal.`,
      cta: certId ? { label: 'View Certificate', href: `/compliance/${certId}` } : undefined,
    }
  }

  return {
    icon: ShieldCheck, iconBg: 'bg-primary/10', iconColor: 'text-primary',
    title: 'Renewal in progress',
    description: 'This certificate renewal is being managed.',
  }
}

// --- Component ---

interface ComplianceOverviewTabProps {
  context: TicketContext
  basic: TicketBasic
  cert: ComplianceCertData | null
  loading: boolean
}

export function ComplianceOverviewTab({ context, basic, cert, loading }: ComplianceOverviewTabProps) {
  const images = basic.images || []
  const certLabel = cert
    ? CERTIFICATE_LABELS[cert.certificate_type as CertificateType] || cert.certificate_type
    : basic.issue_title || context.issue_description || 'Certificate Renewal'

  const stage = getComplianceStage(basic, cert, context)
  const StageIcon = stage.icon

  return (
    <div className="px-4 pb-4 space-y-3">

      {/* ── Card 1: Title ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-warning">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-card-foreground truncate">{certLabel}</p>
            <p className="text-sm text-muted-foreground truncate">{context.property_address}</p>
          </div>
        </div>

        {context.issue_description && cert && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {context.issue_description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Reported on {basic.date_logged
              ? format(new Date(basic.date_logged), "d MMM yyyy 'at' HH:mm")
              : '—'}
          </div>
          {basic.priority && <StatusBadge status={basic.priority} size="md" />}
        </div>
      </div>

      {/* ── Card 2: Current Stage ── */}
      <div className="bg-card rounded-xl border border-border p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Current Stage</p>

        <div className="flex items-start gap-4">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', stage.iconBg)}>
            <StageIcon className={cn('w-5 h-5', stage.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-card-foreground">{stage.title}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{stage.description}</p>
            {basic.date_logged && (
              <p className="text-xs text-muted-foreground/70 mt-2">
                Open {formatDistanceToNow(new Date(basic.date_logged), { addSuffix: true })}
              </p>
            )}
            {stage.cta && (
              <Link
                href={stage.cta.href || '#'}
                className="mt-2 inline-block text-xs font-semibold text-primary hover:text-primary/70 transition-colors"
              >
                {stage.cta.label} →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 3: Certificate Details ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Certificate</p>

        {loading && !cert ? (
          <div className="space-y-2">
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-36 bg-muted animate-pulse rounded" />
            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
          </div>
        ) : !cert ? (
          <p className="text-sm text-muted-foreground">No certificate linked to this ticket.</p>
        ) : (
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
                <a
                  href={cert.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-primary/70 flex items-center gap-1 transition-colors font-semibold"
                >
                  View <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-sm text-muted-foreground/60">Not uploaded</span>
              )}
            </div>

            {basic.scheduled_date && (
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <span className="text-sm text-muted-foreground">Renewal scheduled</span>
                <span className="text-sm font-semibold text-card-foreground">
                  {format(new Date(basic.scheduled_date), 'd MMM yyyy')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Card 4: People ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">People</p>
        <div className="grid grid-cols-2 gap-2">
          {context.landlord_name && context.landlord_id ? (
            <Link
              href={`/landlords/${context.landlord_id}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <Crown className="h-4 w-4 text-warning" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-semibold text-card-foreground truncate">{context.landlord_name}</p>
                <p className="text-[11px] text-muted-foreground">Landlord</p>
              </div>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Crown className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">—</p>
                <p className="text-[11px] text-muted-foreground">Landlord</p>
              </div>
            </div>
          )}

          {cert?.contractor_name && cert.contractor_id ? (
            <Link
              href={`/contractors/${cert.contractor_id}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-success" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-semibold text-card-foreground truncate">{cert.contractor_name}</p>
                <p className="text-[11px] text-muted-foreground">Contractor</p>
              </div>
            </Link>
          ) : basic.contractor_name && basic.contractor_id ? (
            <Link
              href={`/contractors/${basic.contractor_id}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-success" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-semibold text-card-foreground truncate">{basic.contractor_name}</p>
                <p className="text-[11px] text-muted-foreground">Contractor</p>
              </div>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">Not assigned</p>
                <p className="text-[11px] text-muted-foreground">Contractor</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Media ── */}
      {images.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Media ({images.length})
          </p>
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
      )}
    </div>
  )
}
