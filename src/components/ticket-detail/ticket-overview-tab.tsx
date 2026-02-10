'use client'

import { format } from 'date-fns'
import { Building2, Users, Wrench } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { TicketContext, TicketBasic } from '@/hooks/use-ticket-detail'
import { formatCurrency } from '@/hooks/use-ticket-detail'

interface TicketOverviewTabProps {
  context: TicketContext
  basic: TicketBasic
}

function formatDate(date: string | null) {
  if (!date) return null
  return format(new Date(date), 'dd MMM yyyy')
}

/** Single row in the detail table — always rendered, shows TBD when null */
function DetailRow({ label, value, mono, highlight }: {
  label: string
  value: string | null | undefined
  mono?: boolean
  highlight?: boolean
}) {
  const display = value || 'TBD'
  const isEmpty = !value

  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <span className={cn(
        'text-xs text-right',
        isEmpty && 'text-muted-foreground/40 italic',
        !isEmpty && 'font-medium',
        mono && !isEmpty && 'font-mono',
        highlight && !isEmpty && 'text-emerald-600 dark:text-emerald-400 font-semibold',
      )}>
        {display}
      </span>
    </div>
  )
}

export function TicketOverviewTab({ context, basic }: TicketOverviewTabProps) {
  const images = basic.images || []

  return (
    <div className="space-y-5">
      {/* Issue Description */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1">Issue</h4>
        <p className="text-sm leading-relaxed">
          {context.issue_description || 'No description provided'}
        </p>
      </div>

      {/* Details — flat rows, always visible */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1.5">Details</h4>
        <div className="border rounded-lg divide-y">
          <DetailRow label="Category" value={context.category} />
          <DetailRow label="Date Logged" value={formatDate(context.date_logged)} />
          <DetailRow label="Reporter" value={context.reporter_role ? context.reporter_role.charAt(0).toUpperCase() + context.reporter_role.slice(1) : null} />
          <DetailRow label="Availability" value={context.availability} />
          <DetailRow label="Access" value={context.access} />
          <DetailRow label="Scheduled Date" value={formatDate(basic.scheduled_date)} highlight={!!basic.scheduled_date} />
          <DetailRow label="Quote" value={basic.contractor_quote ? formatCurrency(basic.contractor_quote) : null} mono />
          <DetailRow label="Your Markup" value={basic.contractor_quote && basic.final_amount ? formatCurrency(basic.final_amount - basic.contractor_quote) : null} mono />
          <DetailRow label="Final Amount" value={basic.final_amount ? formatCurrency(basic.final_amount) : null} mono highlight={!!basic.final_amount} />
        </div>
      </div>

      {/* People — clickable cards */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1.5">People</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Tenant */}
          {context.tenant_name && (
            <Link
              href={basic.tenant_id ? `/tenants?id=${basic.tenant_id}` : '#'}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{context.tenant_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {context.tenant_phone && <span>{context.tenant_phone}</span>}
                  {context.tenant_role_tag && (
                    <span className="px-1.5 py-0 rounded bg-muted text-[10px]">{context.tenant_role_tag}</span>
                  )}
                </div>
              </div>
            </Link>
          )}

          {/* Property */}
          <Link
            href={`/properties?id=${context.property_id}`}
            className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{context.property_address}</p>
              <p className="text-xs text-muted-foreground">View property</p>
            </div>
          </Link>

          {/* Contractor */}
          {basic.contractor_name && basic.contractor_id && (
            <Link
              href={`/contractors?id=${basic.contractor_id}`}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{basic.contractor_name}</p>
                <p className="text-xs text-muted-foreground">View contractor</p>
              </div>
            </Link>
          )}

          {/* Landlord */}
          {context.landlord_name && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{context.landlord_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {context.landlord_phone && <span>{context.landlord_phone}</span>}
                  {context.landlord_email && <span className="truncate">{context.landlord_email}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photos */}
      {images.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1.5">
            Photos ({images.length})
          </h4>
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
      )}
    </div>
  )
}
