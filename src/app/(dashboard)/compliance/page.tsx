'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { PageShell } from '@/components/page-shell'
import { DataTable, Column } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import { ShieldCheck, Printer } from 'lucide-react'
import Link from 'next/link'

interface ComplianceRow {
  cert_id: string | null
  property_id: string
  certificate_type: CertificateType
  display_status: string
  expiry_date: string | null
  days_remaining: number | null
  issued_date: string | null
  issued_by: string | null
  certificate_number: string | null
  property_address: string
}

interface ComplianceSummary {
  actions_needed: number
  expired: number
  expiring_unscheduled: number
  review: number
  missing: number
  renewal_scheduled: number
  valid: number
  compliant_properties: number
  total_properties: number
  total_required: number
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
  const [summary, setSummary] = useState<ComplianceSummary>({
    actions_needed: 0, expired: 0, expiring_unscheduled: 0, review: 0,
    missing: 0, renewal_scheduled: 0, valid: 0,
    compliant_properties: 0, total_properties: 0, total_required: 0,
  })

  const fetchData = useCallback(async () => {
    if (!propertyManager) return

    const [statusRes, summaryRes] = await Promise.all([
      supabase.rpc('compliance_get_all_statuses', { p_pm_id: propertyManager.id }),
      supabase.rpc('compliance_get_summary', { p_pm_id: propertyManager.id }),
    ])

    if (statusRes.data) {
      const rows: ComplianceRow[] = (statusRes.data as unknown as Array<{
        cert_id: string | null
        property_id: string
        property_address: string
        certificate_type: string
        display_status: string
        expiry_date: string | null
        days_remaining: number | null
        issued_date: string | null
        issued_by: string | null
        certificate_number: string | null
      }>).map((row) => ({
        cert_id: row.cert_id,
        property_id: row.property_id,
        certificate_type: row.certificate_type as CertificateType,
        display_status: row.display_status,
        expiry_date: row.expiry_date,
        days_remaining: row.days_remaining,
        issued_date: row.issued_date,
        issued_by: row.issued_by,
        certificate_number: row.certificate_number,
        property_address: row.property_address || 'Unknown',
      }))
      setCertificates(rows)
    }

    if (summaryRes.data) {
      const s = summaryRes.data as unknown as ComplianceSummary
      setSummary({
        actions_needed: s.actions_needed ?? 0,
        expired: s.expired ?? 0,
        expiring_unscheduled: s.expiring_unscheduled ?? 0,
        review: s.review ?? 0,
        missing: s.missing ?? 0,
        renewal_scheduled: s.renewal_scheduled ?? 0,
        valid: s.valid ?? 0,
        compliant_properties: s.compliant_properties ?? 0,
        total_properties: s.total_properties ?? 0,
        total_required: s.total_required ?? 0,
      })
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Group certificates by property for print view
  const byProperty = useMemo(() => {
    const grouped = new Map<string, { address: string; property_id: string; certs: ComplianceRow[] }>()
    for (const cert of certificates) {
      const key = cert.property_id
      if (!grouped.has(key)) {
        grouped.set(key, { address: cert.property_address, property_id: cert.property_id, certs: [] })
      }
      grouped.get(key)!.certs.push(cert)
    }
    return Array.from(grouped.values())
  }, [certificates])

  const handleExport = () => {
    window.print()
  }

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
      key: 'display_status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusBadge status={row.display_status} />,
      getValue: (row) => row.display_status,
    },
  ]

  return (
    <PageShell
      title="Compliance"
      subtitle={`${summary.total_required} required across ${summary.total_properties} properties`}
      actions={
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 print:hidden">
          <Printer className="h-3.5 w-3.5" />
          Export PDF
        </Button>
      }
      headerExtra={
        summary.total_required > 0 ? (
          <div className="flex items-center gap-4 py-3">
            {summary.expired > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-danger" />
                <span className="text-sm text-muted-foreground">{summary.expired} expired</span>
              </div>
            )}
            {summary.expiring_unscheduled > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-warning" />
                <span className="text-sm text-muted-foreground">{summary.expiring_unscheduled} expiring</span>
              </div>
            )}
            {summary.missing > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="text-sm text-muted-foreground">{summary.missing} missing</span>
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
        getRowId={(row) => row.cert_id || `${row.property_id}-${row.certificate_type}`}
        onRowClick={(row) => {
          if (row.cert_id) {
            window.location.href = `/compliance/${row.cert_id}`
          }
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

      {/* Print-optimized portfolio summary — hidden on screen, shown when printing */}
      <div className="hidden print:block print:p-8">
        <div className="mb-6 border-b pb-4">
          <h1 className="text-2xl font-bold">Compliance Summary</h1>
          <p className="text-sm text-gray-600 mt-1">
            {propertyManager?.business_name || propertyManager?.name} &middot; Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="flex gap-6 mt-3 text-sm">
            <span>{summary.total_properties} properties</span>
            <span>{summary.total_required} required certificates</span>
            <span className="font-semibold">
              {summary.actions_needed === 0
                ? 'All compliant'
                : `${summary.actions_needed} actions needed`}
            </span>
          </div>
        </div>

        {byProperty.map((prop) => (
          <div key={prop.property_id} className="mb-6 break-inside-avoid">
            <h2 className="text-base font-semibold border-b pb-1 mb-2">{prop.address}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 font-medium">Certificate</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1 font-medium">Expires</th>
                  <th className="py-1 font-medium">Issued By</th>
                </tr>
              </thead>
              <tbody>
                {prop.certs.map((cert) => {
                  const isGap = cert.display_status === 'expired' || cert.display_status === 'missing'
                  return (
                    <tr key={cert.certificate_type} className={isGap ? 'text-red-600 font-medium' : ''}>
                      <td className="py-1">{CERTIFICATE_LABELS[cert.certificate_type] || cert.certificate_type}</td>
                      <td className="py-1 capitalize">{cert.display_status.replace(/_/g, ' ')}</td>
                      <td className="py-1">{formatDate(cert.expiry_date)}</td>
                      <td className="py-1">{cert.issued_by || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
