'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { PageShell } from '@/components/page-shell'
import { DataTable, Column } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CertificateFormDialog,
  type CertificateFormData,
} from '@/components/certificate-form-dialog'
import {
  CERTIFICATE_TYPES,
  CERTIFICATE_LABELS,
  type CertificateType,
} from '@/lib/constants'
import { ShieldCheck, Printer, Settings2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ComplianceOnboarding } from '@/components/onboarding/compliance-onboarding'

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

type StatusFilter = 'all' | 'expired' | 'expiring_soon' | 'missing' | 'valid'

interface RequirementRow {
  property_id: string
  certificate_type: string
  is_required: boolean
}

interface PropertyOption {
  id: string
  address: string
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CompliancePage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [certificates, setCertificates] = useState<ComplianceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportProperty, setExportProperty] = useState<string>('all')
  const [exportCertType, setExportCertType] = useState<string>('all')
  const [configOpen, setConfigOpen] = useState(false)
  const [configRequirements, setConfigRequirements] = useState<Map<string, Map<string, boolean>>>(new Map())
  const [configProperties, setConfigProperties] = useState<PropertyOption[]>([])

  // Auto-open create dialog from global "+" menu
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setAddDialogOpen(true)
      window.history.replaceState({}, '', '/compliance')
    }
  }, [searchParams])

  const fetchData = useCallback(async () => {
    if (!propertyManager) return
    const { data } = await supabase.rpc('compliance_get_all_statuses', { p_pm_id: propertyManager.id })
    if (data) {
      setCertificates((data as unknown as Array<{
        cert_id: string | null; property_id: string; property_address: string
        certificate_type: string; display_status: string; expiry_date: string | null
        days_remaining: number | null; issued_date: string | null
        issued_by: string | null; certificate_number: string | null
      }>).map((r) => ({
        cert_id: r.cert_id, property_id: r.property_id,
        certificate_type: r.certificate_type as CertificateType,
        display_status: r.display_status, expiry_date: r.expiry_date,
        days_remaining: r.days_remaining, issued_date: r.issued_date,
        issued_by: r.issued_by, certificate_number: r.certificate_number,
        property_address: r.property_address || 'Unknown',
      })))
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager])

  useEffect(() => { fetchData() }, [fetchData])

  // Counts derived from actual data (single source of truth)
  const counts = useMemo(() => {
    const c = { expired: 0, expiring_soon: 0, missing: 0, valid: 0 }
    for (const cert of certificates) {
      if (cert.display_status === 'expired') c.expired++
      else if (cert.display_status === 'expiring_soon') c.expiring_soon++
      else if (cert.display_status === 'missing') c.missing++
      else if (cert.display_status === 'valid' || cert.display_status === 'renewal_scheduled') c.valid++
    }
    return c
  }, [certificates])

  const filteredCertificates = useMemo(() => {
    if (activeFilter === 'all') return certificates
    return certificates.filter((c) => {
      if (activeFilter === 'valid') return c.display_status === 'valid' || c.display_status === 'renewal_scheduled'
      if (activeFilter === 'expiring_soon') return c.display_status === 'expiring_soon'
      return c.display_status === activeFilter
    })
  }, [certificates, activeFilter])

  // Export data — filtered by export dialog selections
  const exportData = useMemo(() => {
    const source = exportProperty === 'all' ? certificates : certificates.filter((c) => c.property_id === exportProperty)
    const filtered = exportCertType === 'all' ? source : source.filter((c) => c.certificate_type === exportCertType)
    const grouped = new Map<string, { address: string; property_id: string; certs: ComplianceRow[] }>()
    for (const cert of filtered) {
      if (!grouped.has(cert.property_id)) grouped.set(cert.property_id, { address: cert.property_address, property_id: cert.property_id, certs: [] })
      grouped.get(cert.property_id)!.certs.push(cert)
    }
    return Array.from(grouped.values())
  }, [certificates, exportProperty, exportCertType])

  const uniqueProperties = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of certificates) { if (!seen.has(c.property_id)) seen.set(c.property_id, c.property_address) }
    return Array.from(seen.entries()).map(([id, address]) => ({ id, address }))
  }, [certificates])

  const handleAddCertificate = async (formData: CertificateFormData) => {
    if (!propertyManager || !formData.property_id) throw new Error('Missing property')
    const { error } = await supabase.rpc('compliance_upsert_certificate', {
      p_property_id: formData.property_id, p_pm_id: propertyManager.id,
      p_certificate_type: formData.certificate_type, p_issued_date: formData.issued_date,
      p_expiry_date: formData.expiry_date, p_certificate_number: formData.certificate_number,
      p_issued_by: formData.issued_by, p_notes: formData.notes,
      p_reminder_days_before: formData.reminder_days_before, p_contractor_id: formData.contractor_id,
    })
    if (error) throw new Error('Failed to add certificate')
    toast.success('Certificate added')
    await fetchData()
  }

  // Export: navigate to report page with filters as query params
  const handleExportConfirm = () => {
    setExportDialogOpen(false)
    const params = new URLSearchParams()
    if (exportProperty !== 'all') params.set('property', exportProperty)
    if (exportCertType !== 'all') params.set('cert_type', exportCertType)
    const url = `/compliance-report${params.toString() ? '?' + params.toString() : ''}`
    window.open(url, '_blank')
  }

  // Config sheet
  const fetchConfig = useCallback(async () => {
    if (!propertyManager) return
    const [reqRes, propRes] = await Promise.all([
      supabase.from('c1_compliance_requirements').select('property_id, certificate_type, is_required').eq('property_manager_id', propertyManager.id),
      supabase.from('c1_properties').select('id, address').eq('property_manager_id', propertyManager.id).order('address'),
    ])
    if (propRes.data) setConfigProperties(propRes.data as PropertyOption[])
    if (reqRes.data) {
      const reqs = new Map<string, Map<string, boolean>>()
      for (const row of reqRes.data as RequirementRow[]) {
        if (!reqs.has(row.property_id)) reqs.set(row.property_id, new Map())
        reqs.get(row.property_id)!.set(row.certificate_type, row.is_required)
      }
      setConfigRequirements(reqs)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager])

  const handleConfigToggle = async (propertyId: string, certType: string) => {
    if (!propertyManager) return
    const current = configRequirements.get(propertyId)?.get(certType) ?? false
    const newValue = !current
    setConfigRequirements((prev) => {
      const next = new Map(prev)
      if (!next.has(propertyId)) next.set(propertyId, new Map())
      next.get(propertyId)!.set(certType, newValue)
      return next
    })
    const { error } = await supabase.rpc('compliance_upsert_requirements', {
      p_property_id: propertyId, p_pm_id: propertyManager.id,
      p_requirements: [{ certificate_type: certType, is_required: newValue }],
    })
    if (error) {
      toast.error('Failed to update requirement')
      setConfigRequirements((prev) => { const next = new Map(prev); next.get(propertyId)?.set(certType, current); return next })
    }
  }

  const filters: { key: StatusFilter; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'All', count: certificates.length, color: '' },
    { key: 'expired', label: 'Expired', count: counts.expired, color: 'text-danger' },
    { key: 'expiring_soon', label: 'Expiring', count: counts.expiring_soon, color: 'text-warning' },
    { key: 'missing', label: 'Missing', count: counts.missing, color: 'text-muted-foreground' },
    { key: 'valid', label: 'Valid', count: counts.valid, color: 'text-success' },
  ]

  const columns: Column<ComplianceRow>[] = [
    { key: 'certificate_type', header: 'Certificate', sortable: true,
      render: (row) => <span className="font-medium">{CERTIFICATE_LABELS[row.certificate_type] || row.certificate_type}</span>,
      getValue: (row) => CERTIFICATE_LABELS[row.certificate_type] || row.certificate_type },
    { key: 'property_address', header: 'Property', sortable: true,
      render: (row) => <Link href={`/properties/${row.property_id}`} className="text-muted-foreground hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}>{row.property_address}</Link>,
      getValue: (row) => row.property_address },
    { key: 'expiry_date', header: 'Expires', sortable: true,
      render: (row) => <span className="text-muted-foreground">{formatDate(row.expiry_date)}</span>,
      getValue: (row) => row.expiry_date },
    { key: 'issued_by', header: 'Issued By',
      render: (row) => <span className="text-muted-foreground">{row.issued_by || '—'}</span> },
    { key: 'display_status', header: 'Status', sortable: true,
      render: (row) => <StatusBadge status={row.display_status} />,
      getValue: (row) => row.display_status },
  ]

  // Show setup wizard if no certificates have been uploaded yet
  const hasAnyCerts = !loading && certificates.some(c => c.cert_id !== null)
  if (!loading && !hasAnyCerts && certificates.length > 0) {
    return (
      <ComplianceOnboarding
        certificates={certificates}
        pmId={propertyManager?.id || ''}
        onComplete={fetchData}
      />
    )
  }

  return (
    <PageShell
      title="Certificates"
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {filters.map((f) => (
              <button key={f.key} onClick={() => setActiveFilter(f.key)}
                className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                  activeFilter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent border-border text-muted-foreground hover:bg-muted/50')}>
                {f.label}
                {f.count > 0 && <span className={cn('ml-1', activeFilter === f.key ? 'opacity-70' : f.color)}>{f.count}</span>}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-border" />
          <Button variant="outline" size="sm" onClick={() => { fetchConfig(); setConfigOpen(true) }} className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Configure
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      }
    >
      <DataTable data={filteredCertificates} columns={columns}
        getRowId={(row) => row.cert_id || `${row.property_id}-${row.certificate_type}`}
        onRowClick={(row) => { window.location.href = row.cert_id ? `/compliance/${row.cert_id}` : `/compliance/new?property_id=${row.property_id}&type=${row.certificate_type}` }}
        loading={loading}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ShieldCheck className="h-8 w-8 opacity-40" />
            <p className="text-sm">No certificates found</p>
            <p className="text-xs">Add certificates using the + button in the header</p>
          </div>
        }
        fillHeight
      />

      {propertyManager && (
        <CertificateFormDialog open={addDialogOpen} onOpenChange={setAddDialogOpen}
          onSubmit={handleAddCertificate} existingTypes={[]} pmId={propertyManager.id} />
      )}

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Export Compliance Summary</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Property</label>
              <Select value={exportProperty} onValueChange={setExportProperty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All properties</SelectItem>
                  {uniqueProperties.map((p) => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Certificate type</label>
              <Select value={exportCertType} onValueChange={setExportCertType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All certificates</SelectItem>
                  {CERTIFICATE_TYPES.map((ct) => <SelectItem key={ct} value={ct}>{CERTIFICATE_LABELS[ct]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleExportConfirm}>Export PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={configOpen} onOpenChange={(open) => { if (!open) { setConfigOpen(false); fetchData() } }}>
        <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto" title="Configure Requirements">
          <SheetHeader className="mb-4">
            <SheetTitle>Certificate Requirements</SheetTitle>
            <p className="text-sm text-muted-foreground">Choose which certificates are required for each property</p>
          </SheetHeader>
          <div className="flex flex-col gap-6">
            {configProperties.map((prop) => {
              const propReqs = configRequirements.get(prop.id) || new Map()
              return (
                <div key={prop.id}>
                  <h4 className="text-sm font-semibold mb-2">{prop.address}</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {CERTIFICATE_TYPES.map((ct) => {
                      const isRequired = propReqs.get(ct) ?? false
                      return (
                        <button key={ct} type="button" onClick={() => handleConfigToggle(prop.id, ct)}
                          className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left">
                          <div className={cn('h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
                            isRequired ? 'bg-primary border-primary' : 'border-input')}>
                            {isRequired && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span className="truncate text-xs">{CERTIFICATE_LABELS[ct]}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  )
}
