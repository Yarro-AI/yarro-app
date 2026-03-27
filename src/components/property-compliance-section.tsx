'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, ShieldCheck } from 'lucide-react'
import { CertificateRow } from '@/components/certificate-row'
import {
  CertificateFormDialog,
  type CertificateFormData,
} from '@/components/certificate-form-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { CERTIFICATE_LABELS, type CertificateType, type ComplianceCertificate } from '@/lib/constants'

interface PropertyComplianceSectionProps {
  propertyId: string
  pmId: string
}

export function PropertyComplianceSection({ propertyId, pmId }: PropertyComplianceSectionProps) {
  const supabase = createClient()
  const [certificates, setCertificates] = useState<ComplianceCertificate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ComplianceCertificate | null>(null)

  const fetchCertificates = useCallback(async () => {
    const { data, error } = await supabase
      .from('c1_compliance_certificates')
      .select('*')
      .eq('property_id', propertyId)
      .order('expiry_date', { ascending: true, nullsFirst: true })

    if (error) {
      toast.error('Failed to load certificates')
      return
    }
    setCertificates(data || [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase client is stable, same pattern as other pages
  }, [propertyId])

  useEffect(() => {
    fetchCertificates()
  }, [fetchCertificates])

  const handleAdd = async (formData: CertificateFormData) => {
    // If replacing an existing cert of this type, delete it first
    const existing = certificates.find(
      (c) => c.certificate_type === formData.certificate_type
    )
    if (existing) {
      const { error: deleteError } = await supabase
        .from('c1_compliance_certificates')
        .delete()
        .eq('id', existing.id)
      if (deleteError) throw new Error('Failed to replace existing certificate')
    }

    const { error } = await supabase.from('c1_compliance_certificates').insert({
      property_id: propertyId,
      property_manager_id: pmId,
      certificate_type: formData.certificate_type,
      issued_date: formData.issued_date,
      expiry_date: formData.expiry_date,
      certificate_number: formData.certificate_number,
      issued_by: formData.issued_by,
      notes: formData.notes,
    })

    if (error) throw new Error('Failed to add certificate')

    toast.success(
      existing ? 'Certificate replaced' : 'Certificate added'
    )
    await fetchCertificates()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { error } = await supabase
      .from('c1_compliance_certificates')
      .delete()
      .eq('id', deleteTarget.id)

    if (error) {
      toast.error('Failed to delete certificate')
      return
    }

    toast.success('Certificate deleted')
    setDeleteTarget(null)
    await fetchCertificates()
  }

  const existingTypes = certificates.map((c) => c.certificate_type)
  const deleteLabel = deleteTarget
    ? CERTIFICATE_LABELS[deleteTarget.certificate_type]
    : ''

  return (
    <div className="mt-6 flex-shrink-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
        <ShieldCheck className="h-3.5 w-3.5" />
        Compliance
        {certificates.length > 0 && (
          <span className="text-xs font-normal normal-case tracking-normal bg-muted px-1.5 py-0.5 rounded">
            {certificates.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="ml-auto h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors"
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </h3>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : certificates.length === 0 ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full text-left py-4 px-3 -mx-3 rounded-lg border border-dashed border-border hover:bg-muted/30 transition-colors"
        >
          <p className="text-sm text-muted-foreground">No certificates on file</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Click to add your first certificate
          </p>
        </button>
      ) : (
        <div className="space-y-0.5">
          {certificates.map((cert) => (
            <CertificateRow
              key={cert.id}
              certificate={cert}
              onDelete={() => setDeleteTarget(cert)}
            />
          ))}
        </div>
      )}

      <CertificateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAdd}
        existingTypes={existingTypes}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete Certificate"
        description={`Are you sure you want to delete the ${deleteLabel} certificate? This action cannot be undone.`}
        itemName={deleteLabel}
        onConfirm={handleDelete}
      />
    </div>
  )
}
