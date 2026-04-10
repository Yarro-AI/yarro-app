'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { CERTIFICATE_LABELS, CERT_TYPE_CONTRACTOR_CATEGORIES, type CertificateType } from '@/lib/constants'
import Link from 'next/link'
import {
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Pencil,
  Send,
} from 'lucide-react'
import {
  CertificateFormDialog,
  type CertificateFormData,
} from '@/components/certificate-form-dialog'
import { ContractorSelect } from '@/components/contractor-select'

interface CertificateDetail {
  id: string
  property_id: string
  property_manager_id: string
  certificate_type: CertificateType
  issued_date: string | null
  expiry_date: string | null
  certificate_number: string | null
  issued_by: string | null
  document_url: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
  status: string
  contractor_id: string | null
  contractor_name: string | null
  reminder_days_before: number | null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function daysUntilExpiry(dateStr: string | null): string {
  if (!dateStr) return ''
  const expiry = new Date(dateStr)
  const now = new Date()
  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days === 0) return 'Expires today'
  if (days === 1) return '1 day remaining'
  return `${days} days remaining`
}

export default function CertificateDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { propertyManager } = usePM()
  const supabase = createClient()
  const certId = params.id as string

  const [certificate, setCertificate] = useState<CertificateDetail | null>(null)
  const [propertyAddress, setPropertyAddress] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [hasActiveTicket, setHasActiveTicket] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [showContractorPicker, setShowContractorPicker] = useState(false)
  const [pickerContractorId, setPickerContractorId] = useState<string | null>(null)
  const [pickerContractorName, setPickerContractorName] = useState<string | null>(null)

  const fetchCertificate = useCallback(async () => {
    if (!propertyManager) return

    const [certResult, ticketResult] = await Promise.all([
      supabase
        .from('c1_compliance_certificates')
        .select('*, c1_properties(address), c1_contractors(contractor_name)')
        .eq('id', certId)
        .eq('property_manager_id', propertyManager.id)
        .single(),
      supabase
        .from('c1_tickets')
        .select('id, next_action_reason')
        .eq('compliance_certificate_id', certId)
        .eq('status', 'open')
        .eq('archived', false)
        .limit(1),
    ])

    const activeTicket = ticketResult.data?.[0] ?? null
    setHasActiveTicket(!!activeTicket)

    const { data, error } = certResult

    if (error || !data) {
      toast.error('Certificate not found')
      router.push('/compliance')
      return
    }

    // Compute display status — matches compliance_get_all_statuses RPC CASE logic
    let status = 'incomplete'
    if (activeTicket) {
      const reason = activeTicket.next_action_reason as string | null
      if (reason === 'compliance_pending') status = 'awaiting_dispatch'
      else if (reason === 'awaiting_contractor') status = 'awaiting_contractor'
      else if (reason === 'awaiting_booking') status = 'awaiting_booking'
      else if (reason === 'scheduled' || reason === 'awaiting_completion') status = 'renewal_scheduled'
      else if (reason === 'no_contractors') status = 'no_contractors'
      else if (reason === 'manager_approval') status = 'awaiting_approval'
      else status = 'renewal_requested'
    } else if (data.document_url && data.expiry_date) {
      const expiry = new Date(data.expiry_date)
      const now = new Date()
      const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (expiry < now) status = 'expired'
      else if (days <= 30) status = 'expiring_soon'
      else status = 'valid'
    }

    const contractorData = data.c1_contractors as unknown as { contractor_name: string } | null
    setCertificate({
      ...data,
      status,
      contractor_name: contractorData?.contractor_name ?? null,
    } as CertificateDetail)
    setPropertyAddress((data.c1_properties as unknown as { address: string })?.address || 'Unknown')
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certId, propertyManager])

  useEffect(() => {
    fetchCertificate()
  }, [fetchCertificate])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !certificate) return

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)')
      return
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PDF, JPEG, PNG, and WebP files are allowed')
      return
    }

    setUploading(true)

    const ext = file.name.split('.').pop() || 'pdf'
    const filename = `${certificate.property_manager_id}/${certificate.property_id}/${certificate.certificate_type}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('compliance-documents')
      .upload(filename, file, { contentType: file.type })

    if (uploadError) {
      toast.error(`Upload failed: ${uploadError.message}`)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('compliance-documents')
      .getPublicUrl(filename)

    if (!urlData?.publicUrl) {
      toast.error('Failed to get document URL')
      setUploading(false)
      return
    }

    // Update the certificate record with the document URL
    const { error: updateError } = await supabase
      .from('c1_compliance_certificates')
      .update({ document_url: urlData.publicUrl })
      .eq('id', certificate.id)
      .eq('property_manager_id', certificate.property_manager_id)

    if (updateError) {
      toast.error('Failed to save document URL')
      setUploading(false)
      return
    }

    toast.success('Document uploaded')
    setUploading(false)
    await fetchCertificate()

    // Reset the input
    e.target.value = ''
  }

  const handleRemoveDocument = async () => {
    if (!certificate?.document_url) return

    // Extract the path from the URL to delete from storage
    const urlParts = certificate.document_url.split('/compliance-documents/')
    if (urlParts[1]) {
      await supabase.storage
        .from('compliance-documents')
        .remove([decodeURIComponent(urlParts[1])])
    }

    const { error } = await supabase
      .from('c1_compliance_certificates')
      .update({ document_url: null })
      .eq('id', certificate.id)
      .eq('property_manager_id', certificate.property_manager_id)

    if (error) {
      toast.error('Failed to remove document')
      return
    }

    toast.success('Document removed')
    await fetchCertificate()
  }

  const handleDispatch = async (contractorId?: string | null) => {
    if (!certificate || !propertyManager) return
    setDispatching(true)
    try {
      const { data, error } = await supabase.rpc('compliance_dispatch_renewal', {
        p_cert_id: certificate.id,
        p_pm_id: propertyManager.id,
        p_contractor_id: contractorId || null,
      })
      if (error) throw new Error(error.message)
      const result = data as { ticket_id: string; contractor_name: string }
      toast.success(`Renewal dispatched to ${result.contractor_name}`)
      setShowContractorPicker(false)
      setPickerContractorId(null)
      setPickerContractorName(null)
      await fetchCertificate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to dispatch renewal')
    } finally {
      setDispatching(false)
    }
  }

  const canDispatch = certificate &&
    !hasActiveTicket &&
    !['valid', 'renewal_requested', 'renewal_scheduled'].includes(certificate.status)

  const showContractorDropdown = certificate?.certificate_type
    ? CERT_TYPE_CONTRACTOR_CATEGORIES[certificate.certificate_type] !== null
    : false

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!certificate) return null

  const label = CERTIFICATE_LABELS[certificate.certificate_type] || certificate.certificate_type

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/compliance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Compliance
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{label}</h1>
              <Link
                href={`/properties/${certificate.property_id}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {propertyAddress}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canDispatch && showContractorDropdown && (
              <Button
                size="sm"
                onClick={() => {
                  if (certificate.contractor_id) {
                    handleDispatch(certificate.contractor_id)
                  } else {
                    setShowContractorPicker(true)
                  }
                }}
                disabled={dispatching}
                className="gap-1.5"
              >
                {dispatching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {certificate.contractor_id && certificate.contractor_name
                  ? `Dispatch to ${certificate.contractor_name}`
                  : 'Assign & Dispatch'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <StatusBadge status={certificate.status} />
          </div>
        </div>
      </div>

      {/* Expiry warning */}
      {(certificate.status === 'expired' || certificate.status === 'expiring_soon') && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 mb-6 text-sm',
            certificate.status === 'expired'
              ? 'border-danger/30 bg-danger/5 text-danger'
              : 'border-warning/30 bg-warning/5 text-warning'
          )}
        >
          {certificate.status === 'expired'
            ? `This certificate expired on ${formatDate(certificate.expiry_date)}. ${daysUntilExpiry(certificate.expiry_date)}.`
            : `This certificate is expiring soon — ${daysUntilExpiry(certificate.expiry_date)}.`}
        </div>
      )}

      {/* Missing hint — what's needed to be compliant */}
      {certificate.status === 'incomplete' && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 mb-6 text-sm text-warning">
          To mark this certificate as compliant, add:
          {!certificate.expiry_date && !certificate.document_url
            ? ' an expiry date and upload the document.'
            : !certificate.expiry_date
              ? ' an expiry date.'
              : ' the document.'}
        </div>
      )}

      {/* Contractor picker for dispatch (shown when no contractor assigned) */}
      {showContractorPicker && certificate && (
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Select Contractor for Dispatch
          </h2>
          <ContractorSelect
            pmId={certificate.property_manager_id}
            certType={certificate.certificate_type}
            value={pickerContractorId}
            onChange={(id, name) => { setPickerContractorId(id); setPickerContractorName(name) }}
            label="Contractor"
            placeholder="Select a contractor..."
            showNone={false}
          />
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowContractorPicker(false); setPickerContractorId(null); setPickerContractorName(null) }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!pickerContractorId || dispatching}
              onClick={() => handleDispatch(pickerContractorId)}
            >
              {dispatching && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Dispatch to {pickerContractorName || 'contractor'}
            </Button>
          </div>
        </div>
      )}

      {/* Renewal status info */}
      {certificate.status === 'renewal_requested' && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 mb-6 text-sm text-warning">
          Renewal request sent to contractor. Awaiting response.
        </div>
      )}
      {certificate.status === 'renewal_scheduled' && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-6 text-sm text-primary">
          Contractor has booked the renewal.
        </div>
      )}

      {/* Details grid */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Certificate Details
        </h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <DetailItem label="Certificate Type" value={label} />
          <DetailItem label="Status" value={<StatusBadge status={certificate.status} />} />
          <DetailItem label="Certificate Number" value={certificate.certificate_number || '—'} />
          <DetailItem label="Issued By" value={certificate.issued_by || '—'} />
          <DetailItem label="Issued Date" value={formatDate(certificate.issued_date)} />
          <DetailItem label="Expiry Date" value={formatDate(certificate.expiry_date)} />
          {certificate.expiry_date && (
            <DetailItem label="Time Remaining" value={daysUntilExpiry(certificate.expiry_date)} />
          )}
          <DetailItem label="Added" value={formatDate(certificate.created_at)} />
        </div>
        {certificate.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <DetailItem label="Notes" value={certificate.notes} />
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <CertificateFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        existingTypes={[certificate.certificate_type]}
        pmId={certificate.property_manager_id}
        initialData={{
          certificate_type: certificate.certificate_type,
          issued_date: certificate.issued_date,
          expiry_date: certificate.expiry_date || '',
          certificate_number: certificate.certificate_number,
          issued_by: certificate.issued_by,
          notes: certificate.notes,
          reminder_days_before: certificate.reminder_days_before ?? 60,
          contractor_id: certificate.contractor_id ?? null,
        }}
        onSubmit={async (formData) => {
          const { data: newId, error } = await supabase.rpc('compliance_upsert_certificate', {
            p_property_id: certificate.property_id,
            p_pm_id: certificate.property_manager_id,
            p_certificate_type: formData.certificate_type,
            p_issued_date: formData.issued_date,
            p_expiry_date: formData.expiry_date,
            p_certificate_number: formData.certificate_number,
            p_issued_by: formData.issued_by,
            p_notes: formData.notes,
            p_reminder_days_before: formData.reminder_days_before,
            p_contractor_id: formData.contractor_id,
          })
          if (error) throw new Error('Failed to update certificate')
          toast.success('Certificate updated')
          // RPC deletes + re-inserts with new ID — redirect to it
          if (newId && newId !== certId) {
            router.replace(`/compliance/${newId}`)
          } else {
            await fetchCertificate()
          }
        }}
      />

      {/* Document section */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Document
        </h2>

        {certificate.document_url ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {certificate.certificate_type.replace(/_/g, ' ')} document
                </p>
                <p className="text-xs text-muted-foreground">
                  {certificate.document_url.endsWith('.pdf') ? 'PDF' : 'Image'} file
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <a
                  href={certificate.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveDocument}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/20 py-8 cursor-pointer hover:bg-muted/40 hover:border-muted-foreground/30 transition-colors">
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleUpload}
              disabled={uploading}
            />
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="text-sm font-medium">Upload document</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, JPEG, PNG, or WebP — max 10MB
                  </p>
                </div>
              </>
            )}
          </label>
        )}
      </div>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

