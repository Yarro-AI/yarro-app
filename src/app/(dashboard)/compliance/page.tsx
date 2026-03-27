'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { PageShell } from '@/components/page-shell'
import { DataTable, Column } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'

interface ComplianceRow {
  id: string
  property_id: string
  certificate_type: CertificateType
  expiry_date: string | null
  issued_date: string | null
  issued_by: string | null
  certificate_number: string | null
  status: string
  property_address: string
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function CompliancePage() {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const [certificates, setCertificates] = useState<ComplianceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ expired: 0, expiring: 0, valid: 0, total: 0 })

  const fetchData = useCallback(async () => {
    if (!propertyManager) return

    const [certsRes, summaryRes] = await Promise.all([
      supabase
        .from('c1_compliance_certificates')
        .select('id, property_id, certificate_type, expiry_date, issued_date, issued_by, certificate_number, c1_properties(address)')
        .eq('property_manager_id', propertyManager.id)
        .order('expiry_date', { ascending: true, nullsFirst: true }),
      supabase.rpc('compliance_get_summary', { p_pm_id: propertyManager.id }),
    ])

    if (certsRes.data) {
      const rows: ComplianceRow[] = certsRes.data.map((cert) => {
        let status = 'missing'
        if (cert.expiry_date) {
          const expiry = new Date(cert.expiry_date)
          const now = new Date()
          const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (expiry < now) status = 'expired'
          else if (daysUntil <= 30) status = 'expiring'
          else status = 'valid'
        }
        return {
          id: cert.id,
          property_id: cert.property_id,
          certificate_type: cert.certificate_type,
          expiry_date: cert.expiry_date,
          issued_date: cert.issued_date,
          issued_by: cert.issued_by,
          certificate_number: cert.certificate_number,
          status,
          property_address: (cert.c1_properties as unknown as { address: string })?.address || 'Unknown',
        }
      })
      setCertificates(rows)
    }

    const summaryData = summaryRes?.data as Record<string, number> | null
    setSummary({
      expired: summaryData?.expired ?? 0,
      expiring: summaryData?.expiring ?? 0,
      valid: summaryData?.valid ?? 0,
      total: summaryData?.total ?? 0,
    })

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const columns: Column<ComplianceRow>[] = [
    {
      key: 'certificate_type',
      header: 'Certificate',
      sortable: true,
      render: (row) => (
        <span className="font-medium">{CERTIFICATE_LABELS[row.certificate_type] || row.certificate_type}</span>
      ),
      getValue: (row) => CERTIFICATE_LABELS[row.certificate_type] || row.certificate_type,
    },
    {
      key: 'property_address',
      header: 'Property',
      sortable: true,
      render: (row) => (
        <Link
          href={`/properties/${row.property_id}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {row.property_address}
        </Link>
      ),
      getValue: (row) => row.property_address,
    },
    {
      key: 'expiry_date',
      header: 'Expires',
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground">{formatDate(row.expiry_date)}</span>
      ),
      getValue: (row) => row.expiry_date,
    },
    {
      key: 'issued_by',
      header: 'Issued By',
      render: (row) => (
        <span className="text-muted-foreground">{row.issued_by || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
      getValue: (row) => row.status,
    },
  ]

  return (
    <PageShell
      title="Compliance"
      subtitle={`${summary.total} certificates across all properties`}
      headerExtra={
        summary.total > 0 ? (
          <div className="flex items-center gap-4 py-3">
            {summary.expired > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-danger" />
                <span className="text-sm text-muted-foreground">{summary.expired} expired</span>
              </div>
            )}
            {summary.expiring > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-warning" />
                <span className="text-sm text-muted-foreground">{summary.expiring} expiring</span>
              </div>
            )}
            {summary.valid > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground">{summary.valid} valid</span>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      <DataTable
        data={certificates}
        columns={columns}
        searchPlaceholder="Search certificates..."
        searchKeys={['certificate_type', 'property_address', 'issued_by', 'status']}
        getRowId={(row) => row.id}
        onRowClick={(row) => {
          window.location.href = `/properties/${row.property_id}`
        }}
        loading={loading}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ShieldCheck className="h-8 w-8 opacity-40" />
            <p className="text-sm">No compliance certificates found</p>
            <p className="text-xs">Add certificates from the property detail page</p>
          </div>
        }
        fillHeight
      />
    </PageShell>
  )
}
