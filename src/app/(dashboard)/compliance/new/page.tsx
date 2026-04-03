'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Plus, Loader2 } from 'lucide-react'
import {
  CertificateFormDialog,
} from '@/components/certificate-form-dialog'

export default function MissingCertPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { propertyManager } = usePM()
  const supabase = createClient()

  const propertyId = searchParams.get('property_id')
  const certType = searchParams.get('type') as CertificateType | null

  const [propertyAddress, setPropertyAddress] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    async function fetchProperty() {
      if (!propertyId || !propertyManager) return
      const { data } = await supabase
        .from('c1_properties')
        .select('address')
        .eq('id', propertyId)
        .eq('property_manager_id', propertyManager.id)
        .single()
      if (data) setPropertyAddress(data.address)
      setLoading(false)
    }
    fetchProperty()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, propertyManager])

  if (!propertyId || !certType) {
    router.push('/compliance')
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const label = CERTIFICATE_LABELS[certType] || certType

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
              <h1 className="text-xl font-semibold text-muted-foreground">{label}</h1>
              <Link
                href={`/properties/${propertyId}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {propertyAddress}
              </Link>
            </div>
          </div>
          <StatusBadge status="missing" />
        </div>
      </div>

      {/* Missing state */}
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h2 className="text-lg font-semibold text-muted-foreground mb-2">
          No {label.toLowerCase()} uploaded
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          This certificate is required but hasn&apos;t been added yet. Upload it to mark this property as compliant.
        </p>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add certificate
        </Button>
      </div>

      {/* Add dialog */}
      <CertificateFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingTypes={[]}
        pmId={propertyManager?.id || ''}
        propertyId={propertyId}
        initialData={{
          certificate_type: certType,
          issued_date: null,
          expiry_date: '',
          certificate_number: null,
          issued_by: null,
          notes: null,
          reminder_days_before: 60,
          contractor_id: null,
        }}
        onSubmit={async (formData) => {
          const { data: newId, error } = await supabase.rpc('compliance_upsert_certificate', {
            p_property_id: propertyId,
            p_pm_id: propertyManager?.id || '',
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
          toast.success('Certificate added')
          if (newId) {
            router.replace(`/compliance/${newId}`)
          }
        }}
      />
    </div>
  )
}
