'use client'

import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import {
  CERTIFICATE_LABELS,
  type ComplianceCertificate,
} from '@/lib/constants'

interface CertificateRowProps {
  certificate: Pick<ComplianceCertificate, 'id' | 'certificate_type' | 'expiry_date' | 'issued_by'> & { status?: string }
  onDelete?: (id: string) => void
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function CertificateRow({ certificate, onDelete }: CertificateRowProps) {
  const status = certificate.status ?? 'missing'
  const label = CERTIFICATE_LABELS[certificate.certificate_type] || certificate.certificate_type

  return (
    <Link
      href={`/compliance/${certificate.id}`}
      className="grid grid-cols-[2fr_1fr_auto_auto] gap-x-4 items-center py-2.5 -mx-3 px-3 rounded-lg group hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <span className="text-[15px] truncate">{label}</span>
      <span className="text-sm text-muted-foreground truncate">
        {certificate.expiry_date ? `Expires ${formatDate(certificate.expiry_date)}` : 'No expiry set'}
        {certificate.issued_by && ` · ${certificate.issued_by}`}
      </span>
      <StatusBadge status={status} />
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onDelete(certificate.id) }}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </Link>
  )
}
