'use client'

import { Play } from 'lucide-react'
import { getMediaUrls } from '@/hooks/use-ticket-detail'
import type { TicketBasic, CompletionData } from '@/hooks/use-ticket-audit'
import type { ComplianceCert } from '@/hooks/use-ticket-audit'
import type { Json } from '@/types/database'

interface AuditEvidenceProps {
  ticket: TicketBasic
  completion: CompletionData | null
  complianceCert: ComplianceCert | null
}

function MediaGrid({ urls, label }: { urls: string[]; label: string }) {
  if (urls.length === 0) return null

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        {label} ({urls.length})
      </h3>
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
        {urls.map((url, index) => {
          const isVideo = /\.(mp4|mov|webm|avi|mkv|3gp)/i.test(url) || url.includes('/video/')
          return isVideo ? (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group relative"
            >
              <video
                src={url}
                preload="metadata"
                muted
                playsInline
                className="w-full h-24 object-cover rounded-lg border group-hover:opacity-80 transition-opacity"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full bg-foreground/70 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-background fill-background ml-0.5" />
                </div>
              </div>
            </a>
          ) : (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <img
                src={url}
                alt={`${label} ${index + 1}`}
                className="w-full h-24 object-cover rounded-lg border group-hover:opacity-80 transition-opacity"
              />
            </a>
          )
        })}
      </div>
    </div>
  )
}

export function AuditEvidence({ ticket, completion, complianceCert }: AuditEvidenceProps) {
  const ticketImages = ticket.images || []
  const completionMedia = completion ? getMediaUrls(completion.media_urls as Json) : []

  const hasAny = ticketImages.length > 0 || completionMedia.length > 0 || !!complianceCert

  if (!hasAny) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No evidence attached</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MediaGrid urls={ticketImages} label="Reported Images" />
      <MediaGrid urls={completionMedia} label="Completion Evidence" />

      {complianceCert && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Compliance Certificate</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Type:</span>
              <span className="font-medium">{complianceCert.cert_type}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium">{complianceCert.status}</span>
            </div>
            {complianceCert.expiry_date && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Expires:</span>
                <span className="font-medium">{complianceCert.expiry_date}</span>
              </div>
            )}
            {complianceCert.document_url && (
              <a
                href={complianceCert.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2"
              >
                View Document
              </a>
            )}
            {complianceCert.notes && (
              <p className="text-sm text-muted-foreground mt-2">{complianceCert.notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
