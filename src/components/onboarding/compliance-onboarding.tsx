'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import {
  CERTIFICATE_TYPES,
  CERTIFICATE_LABELS,
  type CertificateType,
} from '@/lib/constants'
import { typography } from '@/lib/typography'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Loader2, ChevronLeft, ShieldCheck, CheckCircle,
  Upload, FileText, Building2,
} from 'lucide-react'

// --- Local button components (same pattern as contractor-onboarding) ---

function OnboardingOptionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-center px-5 py-5 rounded-xl border transition-all bg-transparent border-border/60 text-foreground hover:border-primary/30"
    >
      <span className="text-lg font-medium">{label}</span>
    </button>
  )
}

function ToggleOptionButton({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-center px-4 py-3.5 rounded-xl border transition-all ${
        selected
          ? 'border-primary bg-primary/5 text-primary'
          : 'bg-transparent border-border/60 text-foreground hover:border-primary/30'
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

// --- Cert form card (local sub-component) ---

interface CertFormCardProps {
  certType: CertificateType
  propertyAddress: string
  propertyId: string
  pmId: string
  stepNumber: number
  totalSteps: number
  onNext: () => void
  onSkip: () => void
  onBack: () => void
  onSaveAndReturn: () => void
  isFirst: boolean
}

function CertFormCard({
  certType, propertyAddress, propertyId, pmId,
  stepNumber, totalSteps,
  onNext, onSkip, onBack, onSaveAndReturn, isFirst,
}: CertFormCardProps) {
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

    // Update document_url if file was uploaded
    if (documentUrl) {
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
    <>
      {/* Progress */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center">
          {!isFirst && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">
                {stepNumber} of {totalSteps}
              </span>
              <span className="text-xs text-muted-foreground truncate ml-4">
                {propertyAddress.split(',')[0]}
              </span>
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
              />
            </div>
          </div>
          {!isFirst ? <div className="w-8" /> : null}
        </div>
      </div>

      <div className="px-10 pb-8 pt-4">
        <h2 className={`${typography.pageTitle} text-center`}>{label}</h2>
        <p className={`${typography.bodyText} text-center mt-1 mb-6`}>
          {propertyAddress.split(',')[0]}
        </p>

        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium mb-2 block">Expiry date *</label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="h-12 rounded-xl text-base"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Issued by</label>
            <Input
              value={issuedBy}
              onChange={(e) => setIssuedBy(e.target.value)}
              placeholder="e.g. British Gas, Lambeth Council"
              className="h-12 rounded-xl text-base placeholder:text-base"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Certificate number</label>
            <Input
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="Optional"
              className="h-12 rounded-xl text-base placeholder:text-base"
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

        {/* Actions */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={onSkip} disabled={saving}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save & Next
          </Button>
        </div>

        <button
          type="button"
          onClick={onSaveAndReturn}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
        >
          Save & return later
        </button>
      </div>
    </>
  )
}

// --- Main component ---

interface ComplianceRow {
  cert_id: string | null
  property_id: string
  property_address: string
  certificate_type: CertificateType
  display_status: string
}

interface ComplianceOnboardingProps {
  certificates: ComplianceRow[]
  pmId: string
  onComplete: () => void
}

interface CertStep {
  propertyId: string
  propertyAddress: string
  certType: CertificateType
}

type Phase = 'intro' | 'select-types' | 'certs' | 'notification' | 'summary'

export function ComplianceOnboarding({ certificates, pmId, onComplete }: ComplianceOnboardingProps) {
  const { refreshPM } = usePM()
  const router = useRouter()
  const supabase = createClient()

  const [phase, setPhase] = useState<Phase>('intro')
  const [dismissing, setDismissing] = useState(false)

  // Select-types state
  const [currentPropertyIndex, setCurrentPropertyIndex] = useState(0)
  const [selections, setSelections] = useState<Map<string, CertificateType[]>>(() => {
    const map = new Map<string, CertificateType[]>()
    for (const cert of certificates) {
      if (!map.has(cert.property_id)) {
        map.set(cert.property_id, [])
      }
      map.get(cert.property_id)!.push(cert.certificate_type)
    }
    return map
  })
  const [savingRequirements, setSavingRequirements] = useState(false)

  // Cert form state
  const [certSteps, setCertSteps] = useState<CertStep[]>([])
  const [currentCertIndex, setCurrentCertIndex] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)

  // Derive property info
  const properties = useMemo(() => {
    const map = new Map<string, { address: string; certs: CertificateType[] }>()
    for (const cert of certificates) {
      if (!map.has(cert.property_id)) {
        map.set(cert.property_id, { address: cert.property_address, certs: [] })
      }
      map.get(cert.property_id)!.certs.push(cert.certificate_type)
    }
    return Array.from(map.entries()).map(([id, { address }]) => ({ id, address }))
  }, [certificates])

  const totalCerts = certificates.length
  const currentProperty = properties[currentPropertyIndex]
  const currentSelection = currentProperty ? (selections.get(currentProperty.id) || []) : []

  const toggleType = (certType: CertificateType) => {
    if (!currentProperty) return
    setSelections(prev => {
      const next = new Map(prev)
      const current = next.get(currentProperty.id) || []
      if (current.includes(certType)) {
        next.set(currentProperty.id, current.filter(t => t !== certType))
      } else {
        next.set(currentProperty.id, [...current, certType])
      }
      return next
    })
  }

  const handleSelectTypesContinue = async () => {
    if (currentSelection.length === 0) return

    // If more properties, advance to next
    if (currentPropertyIndex < properties.length - 1) {
      setCurrentPropertyIndex(prev => prev + 1)
      return
    }

    // All properties done — save requirements and build cert steps
    setSavingRequirements(true)
    for (const prop of properties) {
      const selectedTypes = selections.get(prop.id) || []
      const requirements = CERTIFICATE_TYPES.map(ct => ({
        certificate_type: ct,
        is_required: selectedTypes.includes(ct),
      }))

      const { error } = await supabase.rpc('compliance_upsert_requirements', {
        p_property_id: prop.id,
        p_pm_id: pmId,
        p_requirements: requirements,
      })

      if (error) {
        toast.error(`Failed to save requirements: ${error.message}`)
        setSavingRequirements(false)
        return
      }
    }
    setSavingRequirements(false)

    // Build cert steps from selections
    const steps: CertStep[] = []
    for (const prop of properties) {
      const selectedTypes = selections.get(prop.id) || []
      for (const ct of selectedTypes) {
        steps.push({ propertyId: prop.id, propertyAddress: prop.address, certType: ct })
      }
    }
    setCertSteps(steps)
    setCurrentCertIndex(0)
    setPhase('certs')
  }

  const handleSelectTypesBack = () => {
    if (currentPropertyIndex > 0) {
      setCurrentPropertyIndex(prev => prev - 1)
    } else {
      setPhase('intro')
    }
  }

  const advanceCert = () => {
    if (currentCertIndex >= certSteps.length - 1) {
      setPhase('notification')
    } else {
      setCurrentCertIndex(prev => prev + 1)
    }
  }

  const handleNotificationSelect = async (method: 'whatsapp' | 'email') => {
    await supabase
      .from('c1_property_managers')
      .update({ preferred_contact_method: method })
      .eq('id', pmId)

    setPhase('summary')
  }

  const handleDismiss = async () => {
    await refreshPM()
    setDismissing(true)
    setTimeout(() => router.push('/'), 600)
  }

  const handleSaveAndReturn = async () => {
    onComplete()
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        dismissing ? 'bg-black/0 backdrop-blur-0' : 'bg-black/40 backdrop-blur-sm'
      }`}
    >
      <div
        className={`w-full max-w-xl px-4 transition-all duration-500 ${
          dismissing ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {/* Intro */}
        {phase === 'intro' && (
          <div className="bg-card rounded-2xl border border-border p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h2 className={`${typography.pageTitle} text-center`}>
              Set up your compliance
            </h2>
            <p className={`${typography.bodyText} text-center mt-3 mb-4 max-w-xs mx-auto`}>
              We&apos;ll walk you through each property and its required certificates.
              Upload what you have, skip what you don&apos;t.
            </p>
            <div className="flex items-center justify-center gap-4 mb-8 text-sm text-muted-foreground">
              <span>{properties.length} {properties.length === 1 ? 'property' : 'properties'}</span>
              <span>&middot;</span>
              <span>{totalCerts} certificates</span>
            </div>
            <Button onClick={() => setPhase('select-types')} size="lg" className="w-full">
              Start now
            </Button>
          </div>
        )}

        {/* Select Types */}
        {phase === 'select-types' && currentProperty && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center px-6 pt-6 pb-2">
              <button
                onClick={handleSelectTypesBack}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1" />
              <div className="w-8" />
            </div>

            <div className="px-10 pb-10 pt-2">
              {properties.length > 1 && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Property {currentPropertyIndex + 1} of {properties.length}
                  </span>
                </div>
              )}

              <h2 className={`${typography.pageTitle} text-center`}>
                What certificates does {currentProperty.address.split(',')[0]} need?
              </h2>

              <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto mt-6 mb-6">
                {CERTIFICATE_TYPES.map(ct => (
                  <ToggleOptionButton
                    key={ct}
                    label={CERTIFICATE_LABELS[ct]}
                    selected={currentSelection.includes(ct)}
                    onClick={() => toggleType(ct)}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {currentSelection.length} selected
                </span>
                <Button
                  onClick={handleSelectTypesContinue}
                  disabled={currentSelection.length === 0 || savingRequirements}
                >
                  {savingRequirements && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  Continue
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cert Forms */}
        {phase === 'certs' && certSteps[currentCertIndex] && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <CertFormCard
              key={`${certSteps[currentCertIndex].propertyId}-${certSteps[currentCertIndex].certType}`}
              certType={certSteps[currentCertIndex].certType}
              propertyAddress={certSteps[currentCertIndex].propertyAddress}
              propertyId={certSteps[currentCertIndex].propertyId}
              pmId={pmId}
              stepNumber={currentCertIndex + 1}
              totalSteps={certSteps.length}
              onNext={() => { setSavedCount(prev => prev + 1); advanceCert() }}
              onSkip={() => { setSkippedCount(prev => prev + 1); advanceCert() }}
              onBack={() => setCurrentCertIndex(prev => Math.max(0, prev - 1))}
              onSaveAndReturn={handleSaveAndReturn}
              isFirst={currentCertIndex === 0}
            />
          </div>
        )}

        {/* Notification Preference */}
        {phase === 'notification' && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center px-6 pt-6 pb-2">
              <button
                onClick={() => setPhase('certs')}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1" />
              <div className="w-8" />
            </div>
            <div className="px-10 pb-10 pt-4">
              <h2 className={`${typography.pageTitle} text-center`}>
                How would you like to be notified about compliance?
              </h2>
              <p className={`${typography.bodyText} text-center mt-2 mb-8`}>
                We&apos;ll remind you before certificates expire.
              </p>
              <div className="space-y-3">
                <OnboardingOptionButton label="WhatsApp" onClick={() => handleNotificationSelect('whatsapp')} />
                <OnboardingOptionButton label="Email" onClick={() => handleNotificationSelect('email')} />
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        {phase === 'summary' && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="px-10 pt-8 pb-2">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </div>
            <div className="px-10 pb-10 pt-4">
              <h2 className={`${typography.pageTitle} text-center`}>
                Compliance configured
              </h2>
              <p className={`${typography.bodyText} text-center mt-1 mb-6`}>
                You can upload remaining certificates at any time.
              </p>

              <div className="flex items-center justify-center gap-6 mb-8 text-sm">
                {savedCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    <span>{savedCount} uploaded</span>
                  </div>
                )}
                {skippedCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                    <span>{skippedCount} skipped</span>
                  </div>
                )}
              </div>

              <Button onClick={handleDismiss} className="w-full" size="lg">
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
