'use client'

import { format } from 'date-fns'
import { Users, Wrench, MapPin, Crown } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TicketContext, TicketBasic, MessageData } from '@/hooks/use-ticket-detail'
import { formatCurrency, getContractors, getRecipient } from '@/hooks/use-ticket-detail'
import { SlaBadge } from '@/components/sla-badge'
import { SLA_WINDOWS } from '@/lib/constants'

interface TicketOverviewTabProps {
  context: TicketContext
  basic: TicketBasic
  messages?: MessageData | null
}

function formatDate(date: string | null) {
  if (!date) return null
  return format(new Date(date), 'dd MMM yyyy')
}

function DashedLine() {
  return <div className="w-full border-t border-dashed border-border/40" aria-hidden="true" />
}

/** Detail cell — label above value, stacked vertically */
function DetailCell({ label, value, mono, highlight, waiting }: {
  label: string
  value: string | null | undefined
  mono?: boolean
  highlight?: boolean
  waiting?: boolean
}) {
  const display = value || (waiting ? 'Awaiting' : null)
  if (!display && !waiting) return null

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider">{label}</p>
      <p className={cn(
        'text-[15px]',
        !value && waiting && 'text-muted-foreground/40 italic text-sm',
        value && mono && 'font-mono',
        value && highlight && 'font-semibold text-emerald-600 dark:text-emerald-400',
        value && !highlight && 'font-medium text-foreground',
      )}>
        {display}
      </p>
    </div>
  )
}

export function TicketOverviewTab({ context, basic, messages }: TicketOverviewTabProps) {
  const images = basic.images || []

  const contractorNotes = (() => {
    if (!messages?.contractors) return null
    const contractors = getContractors(messages.contractors)
    const approved = contractors.find(c => c.manager_decision === 'approved')
    if (approved?.quote_notes) return approved.quote_notes
    if (basic.contractor_id) {
      const matched = contractors.find(c => c.id === basic.contractor_id)
      if (matched?.quote_notes) return matched.quote_notes
    }
    const withNotes = contractors.find(c => c.quote_notes)
    return withNotes?.quote_notes || null
  })()

  const markup = (() => {
    if (basic.contractor_quote && basic.final_amount) return formatCurrency(basic.final_amount - basic.contractor_quote)
    const mgr = getRecipient(messages?.manager ?? null)
    if (basic.contractor_quote && mgr?.approval_amount) return formatCurrency(Number(mgr.approval_amount) - basic.contractor_quote)
    return null
  })()

  return (
    <div className="space-y-5">
      {/* Issue Description */}
      <div className="bg-muted/30 rounded-xl p-4">
        <p className="text-sm leading-relaxed">
          {context.issue_description || 'No description provided'}
        </p>
      </div>

      {/* SLA */}
      {basic.sla_due_at && (
        <div className="flex items-center gap-3 px-1">
          <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider">SLA</p>
          <SlaBadge
            slaDueAt={basic.sla_due_at}
            resolvedAt={basic.resolved_at}
            priority={basic.priority}
            dateLogged={basic.date_logged}
            archived={basic.archived}
            ticketStatus={basic.status}
          />
          {basic.priority && SLA_WINDOWS[basic.priority] && (
            <span className="text-xs text-muted-foreground">
              ({basic.priority} — {SLA_WINDOWS[basic.priority] < 1440
                ? `${SLA_WINDOWS[basic.priority] / 60}h window`
                : `${SLA_WINDOWS[basic.priority] / 1440}d window`})
            </span>
          )}
        </div>
      )}

      <DashedLine />

      {/* Two-column layout: Left = known details, Right = progressing/financial */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {/* LEFT — details we always have */}
        <div className="space-y-4">
          <DetailCell label="Category" value={context.category} />
          <DetailCell label="Priority" value={basic.priority} />
          <DetailCell label="Date Logged" value={formatDate(context.date_logged)} />
          <DetailCell label="Reporter" value={context.reporter_role ? context.reporter_role.charAt(0).toUpperCase() + context.reporter_role.slice(1) : null} />
          <DetailCell label="Availability" value={context.availability} />
          <DetailCell label="Access" value={context.access} />
        </div>

        {/* RIGHT — progressing / financial (always visible so we know what's pending) */}
        <div className="space-y-4">
          <DetailCell label="Quote" value={basic.contractor_quote ? formatCurrency(basic.contractor_quote) : null} mono waiting />
          {contractorNotes && <DetailCell label="Quote Notes" value={contractorNotes} />}
          <DetailCell label="Markup" value={markup} mono waiting />
          <DetailCell label="Final Amount" value={basic.final_amount ? formatCurrency(basic.final_amount) : null} mono highlight waiting />
          <DetailCell label="Scheduled Date" value={formatDate(basic.scheduled_date)} highlight waiting />
        </div>
      </div>

      <DashedLine />

      {/* Linked Parties */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider px-1">Linked</p>

        {context.tenant_name && (
          <Link
            href={basic.tenant_id ? `/tenants?id=${basic.tenant_id}` : '#'}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:underline">{context.tenant_name}</p>
              <p className="text-[11px] text-muted-foreground">Tenant</p>
            </div>
          </Link>
        )}

        <Link
          href={`/properties/${context.property_id}`}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
        >
          <div className="h-7 w-7 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
            <MapPin className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:underline">{context.property_address}</p>
            <p className="text-[11px] text-muted-foreground">Property</p>
          </div>
        </Link>

        {basic.contractor_name && basic.contractor_id && (
          <Link
            href={`/contractors/${basic.contractor_id}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="h-7 w-7 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
              <Wrench className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:underline">{basic.contractor_name}</p>
              <p className="text-[11px] text-muted-foreground">Contractor</p>
            </div>
          </Link>
        )}

        {context.landlord_name && (
          <Link
            href={`/properties/${context.property_id}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Crown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:underline">{context.landlord_name}</p>
              <p className="text-[11px] text-muted-foreground">Landlord</p>
            </div>
          </Link>
        )}
      </div>

      {/* Photos */}
      {images.length > 0 && (
        <>
          <DashedLine />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider mb-2 px-1">
              Photos ({images.length})
            </p>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {images.map((url, index) => (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-20 object-cover rounded-lg border group-hover:opacity-80 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
