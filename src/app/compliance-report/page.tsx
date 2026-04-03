'use client'

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import { Loader2 } from 'lucide-react'

interface ComplianceRow {
  cert_id: string | null
  property_id: string
  property_address: string
  certificate_type: string
  display_status: string
  expiry_date: string | null
  issued_by: string | null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ComplianceReportContent() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [data, setData] = useState<ComplianceRow[]>([])
  const [loading, setLoading] = useState(true)

  const propertyFilter = searchParams.get('property')
  const certTypeFilter = searchParams.get('cert_type')

  const fetchData = useCallback(async () => {
    if (!propertyManager) return
    const { data: rows } = await supabase.rpc('compliance_get_all_statuses', { p_pm_id: propertyManager.id })
    if (rows) setData(rows as unknown as ComplianceRow[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = data
    if (propertyFilter) result = result.filter((r) => r.property_id === propertyFilter)
    if (certTypeFilter) result = result.filter((r) => r.certificate_type === certTypeFilter)
    return result
  }, [data, propertyFilter, certTypeFilter])

  const byProperty = useMemo(() => {
    const grouped = new Map<string, { address: string; certs: ComplianceRow[] }>()
    for (const cert of filtered) {
      if (!grouped.has(cert.property_id)) grouped.set(cert.property_id, { address: cert.property_address, certs: [] })
      grouped.get(cert.property_id)!.certs.push(cert)
    }
    return Array.from(grouped.values())
  }, [filtered])

  const actionsNeeded = filtered.filter((r) =>
    r.display_status === 'expired' || r.display_status === 'incomplete' ||
    r.display_status === 'expiring_soon' || r.display_status === 'review'
  ).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 p-8 print:p-6">
      {/* Print button */}
      <div className="flex justify-end mb-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Report header */}
      <div className="mb-8 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Compliance Summary</h1>
        <p className="text-sm text-gray-500 mt-1">
          {propertyManager?.business_name || propertyManager?.name} &middot; Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-6 mt-3 text-sm text-gray-700">
          <span>{byProperty.length} {byProperty.length === 1 ? 'property' : 'properties'}</span>
          <span>{filtered.length} certificates</span>
          <span className="font-semibold">
            {actionsNeeded === 0 ? 'All compliant' : `${actionsNeeded} actions needed`}
          </span>
        </div>
      </div>

      {/* Per-property tables */}
      {byProperty.map((prop) => (
        <div key={prop.address} className="mb-8 break-inside-avoid">
          <h2 className="text-base font-semibold border-b border-gray-200 pb-1 mb-3 text-gray-900">{prop.address}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 font-medium">Certificate</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Expires</th>
                <th className="py-2 font-medium">Issued By</th>
              </tr>
            </thead>
            <tbody>
              {prop.certs.map((cert) => {
                const isGap = cert.display_status === 'expired' || cert.display_status === 'incomplete'
                return (
                  <tr key={cert.certificate_type} className={isGap ? 'text-red-600 font-medium' : 'text-gray-700'}>
                    <td className="py-1.5">{CERTIFICATE_LABELS[cert.certificate_type as CertificateType] || cert.certificate_type}</td>
                    <td className="py-1.5 capitalize">{cert.display_status.replace(/_/g, ' ')}</td>
                    <td className="py-1.5">{formatDate(cert.expiry_date)}</td>
                    <td className="py-1.5">{cert.issued_by || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default function ComplianceReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    }>
      <ComplianceReportContent />
    </Suspense>
  )
}
