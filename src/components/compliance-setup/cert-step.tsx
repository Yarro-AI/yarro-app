'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import { Upload, FileText, Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

interface CertStepProps {
  propertyAddress: string
  propertyId: string
  pmId: string
  certType: CertificateType
  stepNumber: number
  totalSteps: number
  onNext: () => void
  onSkip: () => void
  onBack: () => void
  isFirst: boolean
  onSaveAndReturn?: () => void
}

export function CertStep({
  propertyAddress,
  propertyId,
  pmId,
  certType,
  stepNumber,
  totalSteps,
  onNext,
  onSkip,
  onBack,
  isFirst,
  onSaveAndReturn,
}: CertStepProps) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const [issuedBy, setIssuedBy] = useState('')
  const [certNumber, setCertNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const label = CERTIFICATE_LABELS[certType] || certType

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)')
      return
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(f.type)) {
      toast.error('Only PDF, JPEG, PNG, and WebP files are allowed')
      return
    }
    setFile(f)
  }

  const handleSave = async () => {
    if (!expiryDate) {
      toast.error('Expiry date is required')
      return
    }

    setSaving(true)

    let documentUrl: string | null = null

    // Upload file if selected
    if (file) {
      const ext = file.name.split('.').pop() || 'pdf'
      const filename = `${pmId}/${propertyId}/${certType}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('compliance-documents')
        .upload(filename, file, { contentType: file.type })

      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`)
        setSaving(false)
        return
      }

      const { data: urlData } = supabase.storage
        .from('compliance-documents')
        .getPublicUrl(filename)

      documentUrl = urlData?.publicUrl || null
    }

    // Save certificate via RPC
    const { error } = await supabase.rpc('compliance_upsert_certificate', {
      p_property_id: propertyId,
      p_pm_id: pmId,
      p_certificate_type: certType,
      p_issued_date: null,
      p_expiry_date: expiryDate,
      p_certificate_number: certNumber || null,
      p_issued_by: issuedBy || null,
      p_notes: null,
      p_reminder_days_before: 60,
      p_contractor_id: null,
    })

    if (error) {
      toast.error('Failed to save certificate')
      setSaving(false)
      return
    }

    // If we uploaded a file, update the document_url directly
    if (documentUrl) {
      // Get the cert ID from the upsert (it returns the new ID but we need to query)
      const { data: certData } = await supabase
        .from('c1_compliance_certificates')
        .select('id')
        .eq('property_id', propertyId)
        .eq('property_manager_id', pmId)
        .eq('certificate_type', certType)
        .single()

      if (certData) {
        await supabase
          .from('c1_compliance_certificates')
          .update({ document_url: documentUrl })
          .eq('id', certData.id)
      }
    }

    toast.success(`${label} saved`)
    setSaving(false)
    onNext()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto px-6">
      {/* Progress */}
      <div className="w-full mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            Step {stepNumber} of {totalSteps}
          </span>
          <span className="text-xs text-muted-foreground truncate ml-4">
            {propertyAddress}
          </span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="w-full bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1">{label}</h2>
        <p className="text-sm text-muted-foreground mb-6">{propertyAddress}</p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Expiry date *</label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Issued by</label>
            <Input
              value={issuedBy}
              onChange={(e) => setIssuedBy(e.target.value)}
              placeholder="e.g. British Gas, Lambeth Council"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Certificate number</label>
            <Input
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Document</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <button
                type="button"
                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="flex items-center gap-2 w-full px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="truncate flex-1 text-left">{file.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">Change</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 w-full px-3 py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Upload PDF, JPEG, or PNG (max 10MB)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between w-full mt-6">
        <div>
          {!isFirst && (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onSkip} disabled={saving}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save & Next
          </Button>
        </div>
      </div>

      {onSaveAndReturn && (
        <button
          type="button"
          onClick={onSaveAndReturn}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Save & return later
        </button>
      )}
    </div>
  )
}
