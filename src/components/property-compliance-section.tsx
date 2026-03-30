'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, ShieldCheck, Settings2, Check } from 'lucide-react'
import { CertificateRow } from '@/components/certificate-row'
import {
  CertificateFormDialog,
  type CertificateFormData,
} from '@/components/certificate-form-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import {
  CERTIFICATE_LABELS,
  CERTIFICATE_TYPES,
  type CertificateType,
} from '@/lib/constants'

interface PropertyComplianceSectionProps {
  propertyId: string
  pmId: string
}

interface ComplianceStatusRow {
  certificate_type: string
  display_status: string
  expiry_date: string | null
  days_remaining: number | null
  cert_id: string | null
  issued_by: string | null
  certificate_number: string | null
  document_url: string | null
  renewal_ticket_id: string | null
  reminder_days_before: number | null
  contractor_id: string | null
}

export function PropertyComplianceSection({ propertyId, pmId }: PropertyComplianceSectionProps) {
  const supabase = createClient()
  const [statusRows, setStatusRows] = useState<ComplianceStatusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; certificate_type: string } | null>(null)
  const [configMode, setConfigMode] = useState(false)
  const [requirementState, setRequirementState] = useState<Record<string, boolean>>({})

  const fetchStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc('compliance_get_property_status', {
      p_property_id: propertyId,
      p_pm_id: pmId,
    })

    if (error) {
      toast.error('Failed to load compliance status')
      return
    }
    const rows = (data as unknown as ComplianceStatusRow[]) || []
    setStatusRows(rows)

    // Build requirement state from what's returned (all returned rows are required)
    const reqState: Record<string, boolean> = {}
    for (const ct of CERTIFICATE_TYPES) {
      reqState[ct] = rows.some((r) => r.certificate_type === ct)
    }
    setRequirementState(reqState)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleAdd = async (formData: CertificateFormData) => {
    const wasReplacement = statusRows.some(
      (r) => r.certificate_type === formData.certificate_type && r.cert_id
    )

    const { error } = await supabase.rpc('compliance_upsert_certificate', {
      p_property_id: propertyId,
      p_pm_id: pmId,
      p_certificate_type: formData.certificate_type,
      p_issued_date: formData.issued_date,
      p_expiry_date: formData.expiry_date,
      p_certificate_number: formData.certificate_number,
      p_issued_by: formData.issued_by,
      p_notes: formData.notes,
      p_reminder_days_before: formData.reminder_days_before,
      p_contractor_id: formData.contractor_id,
    })

    if (error) throw new Error('Failed to add certificate')

    toast.success(wasReplacement ? 'Certificate replaced' : 'Certificate added')
    await fetchStatus()
  }

  const handleDelete = async () => {
    if (!deleteTarget?.id) return
    const { error } = await supabase.rpc('compliance_delete_certificate', {
      p_cert_id: deleteTarget.id,
      p_pm_id: pmId,
    })

    if (error) {
      toast.error('Failed to delete certificate')
      return
    }

    toast.success('Certificate deleted')
    setDeleteTarget(null)
    await fetchStatus()
  }

  const handleRequirementToggle = async (certType: string) => {
    const newValue = !requirementState[certType]
    setRequirementState((prev) => ({ ...prev, [certType]: newValue }))

    const { error } = await supabase.rpc('compliance_upsert_requirements', {
      p_property_id: propertyId,
      p_pm_id: pmId,
      p_requirements: [{ certificate_type: certType, is_required: newValue }],
    })

    if (error) {
      toast.error('Failed to update requirement')
      setRequirementState((prev) => ({ ...prev, [certType]: !newValue }))
      return
    }

    await fetchStatus()
  }

  const existingTypes = statusRows
    .filter((r) => r.cert_id)
    .map((r) => r.certificate_type as CertificateType)
  const deleteLabel = deleteTarget
    ? CERTIFICATE_LABELS[deleteTarget.certificate_type as CertificateType] || deleteTarget.certificate_type
    : ''

  return (
    <div className="mt-6 flex-shrink-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
        <ShieldCheck className="h-3.5 w-3.5" />
        Compliance
        {statusRows.length > 0 && (
          <span className="text-xs font-normal normal-case tracking-normal bg-muted px-1.5 py-0.5 rounded">
            {statusRows.filter((r) => r.cert_id).length}/{statusRows.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setConfigMode(!configMode)}
            className={`h-6 w-6 rounded-md border border-input flex items-center justify-center transition-colors ${
              configMode ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent/50'
            }`}
            title="Configure required certificates"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </h3>

      {configMode && (
        <div className="mb-4 p-3 -mx-3 rounded-lg border border-dashed border-border bg-muted/20">
          <p className="text-xs text-muted-foreground mb-2">
            Select which certificates are required for this property
          </p>
          <div className="grid grid-cols-2 gap-1">
            {CERTIFICATE_TYPES.map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => handleRequirementToggle(ct)}
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left"
              >
                <div
                  className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    requirementState[ct]
                      ? 'bg-primary border-primary'
                      : 'border-input'
                  }`}
                >
                  {requirementState[ct] && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
                <span className="truncate">
                  {CERTIFICATE_LABELS[ct]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : statusRows.length === 0 ? (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full text-left py-4 px-3 -mx-3 rounded-lg border border-dashed border-border hover:bg-muted/30 transition-colors"
        >
          <p className="text-sm text-muted-foreground">No certificates required</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Configure required certificates or add one manually
          </p>
        </button>
      ) : (
        <div className="space-y-0.5">
          {statusRows.map((row) => (
            <CertificateRow
              key={row.certificate_type}
              certificate={{
                id: row.cert_id || row.certificate_type,
                certificate_type: row.certificate_type as CertificateType,
                expiry_date: row.expiry_date,
                issued_by: row.issued_by,
                status: row.display_status,
              }}
              onDelete={
                row.cert_id
                  ? () => setDeleteTarget({ id: row.cert_id!, certificate_type: row.certificate_type })
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <CertificateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAdd}
        existingTypes={existingTypes}
        pmId={pmId}
        propertyId={propertyId}
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
