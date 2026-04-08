'use client'

import { CollapsibleSection } from '@/components/collapsible-section'
import { CheckCircle, XCircle, Wrench } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CompletionData } from '@/hooks/use-ticket-detail'
import { formatCurrency, getMediaUrls } from '@/hooks/use-ticket-detail'
import { DetailCell } from '@/components/detail-cell'

interface TicketCompletionTabProps {
  completion: CompletionData
}

function DashedLine() {
  return <div className="w-full border-t border-dashed border-border/40" aria-hidden="true" />
}

export function TicketCompletionTab({ completion }: TicketCompletionTabProps) {
  const mediaUrls = getMediaUrls(completion.media_urls)

  return (
    <div className="space-y-5">
      {/* Status + Contractor */}
      <div className="flex items-center gap-3">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border bg-transparent',
          completion.completed
            ? 'border-green-400 text-green-600'
            : 'border-red-400 text-red-600'
        )}>
          {completion.completed ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {completion.completed ? 'Completed' : 'Not Done'}
        </span>
        {completion.contractor_name && (
          <Link
            href={completion.contractor_id ? `/contractors?id=${completion.contractor_id}` : '#'}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Wrench className="h-3.5 w-3.5" />
            {completion.contractor_name}
          </Link>
        )}
      </div>

      <DashedLine />

      {/* Two-column: Left = amounts, Right = meta */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div className="space-y-4">
          <DetailCell label="Quote" value={formatCurrency(completion.quote_amount)} mono />
          <DetailCell label="Markup" value={formatCurrency(Math.abs(completion.markup_amount || 0))} mono />
          <DetailCell label="Total" value={formatCurrency(completion.total_amount)} mono highlight />
        </div>
        <div className="space-y-4">
          <DetailCell label="Received" value={format(new Date(completion.received_at), 'dd MMM yyyy, HH:mm')} />
        </div>
      </div>

      {/* Notes */}
      {(completion.notes || completion.completion_text) && (
        <>
          <DashedLine />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider mb-2 px-1">Notes</p>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {completion.notes || completion.completion_text}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Reason (if not completed) */}
      {!completion.completed && completion.reason && (
        <>
          <DashedLine />
          <div>
            <p className="text-[10px] font-medium text-destructive/70 uppercase tracking-wider mb-2 px-1">Reason</p>
            <div className="bg-red-500/5 rounded-xl p-4">
              <p className="text-sm text-destructive leading-relaxed">{completion.reason}</p>
            </div>
          </div>
        </>
      )}

      {/* Photos */}
      {mediaUrls.length > 0 && (
        <>
          <DashedLine />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider mb-2 px-1">
              Photos ({mediaUrls.length})
            </p>
            {mediaUrls.length > 6 ? (
              <CollapsibleSection
                title="Photos"
                count={mediaUrls.length}
                defaultOpen={false}
              >
                <div className="grid grid-cols-3 gap-1.5">
                  {mediaUrls.map((url, index) => (
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
                        className="w-full h-16 object-cover rounded border group-hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </CollapsibleSection>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {mediaUrls.map((url, index) => (
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
            )}
          </div>
        </>
      )}
    </div>
  )
}
