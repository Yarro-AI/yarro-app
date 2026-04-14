'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { normalizeRecord, isValidUKPhone, isValidEmail } from '@/lib/normalize'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'
import { typography } from '@/lib/typography'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft, Wrench, MessageCircle, Mail, CheckCircle, Building2, Upload, X } from 'lucide-react'
import { BulkImportDialog } from '@/components/bulk-import/bulk-import-dialog'

// Single-select option (contact method) — same as tenant-onboarding
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

// Multi-select toggle (trades, properties)
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
      <span className="text-base font-medium">{label}</span>
    </button>
  )
}

interface PropertyAddress {
  id: string
  address: string
}

type Step = 'intro' | 'name' | 'trades' | 'phone' | 'contact-method' | 'contact-detail' | 'properties' | 'summary'

export function ContractorOnboarding() {
  const { propertyManager, refreshPM } = usePM()
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('intro')
  const [contractorName, setContractorName] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [contactMethod, setContactMethod] = useState<'whatsapp' | 'email'>('whatsapp')
  const [email, setEmail] = useState('')
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([])
  const [allProperties, setAllProperties] = useState<PropertyAddress[]>([])
  const [loadingProperties, setLoadingProperties] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [refetchKey, setRefetchKey] = useState(0)

  // Fetch PM's properties on mount
  useEffect(() => {
    if (!propertyManager) return
    async function fetchProperties() {
      const { data } = await supabase
        .from('c1_properties')
        .select('id, address')
        .eq('property_manager_id', propertyManager!.id)
        .order('address')
      if (data) {
        setAllProperties(data)
        setSelectedPropertyIds(data.map(p => p.id))
      }
      setLoadingProperties(false)
    }
    fetchProperties()
  }, [propertyManager, supabase])

  const firstName = contractorName.split(' ')[0]

  const toggleCategory = (cat: string) => {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  const toggleProperty = (id: string) => {
    setSelectedPropertyIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const handleBack = () => {
    setError(null)
    switch (step) {
      case 'name': setStep('intro'); break
      case 'trades': setStep('name'); break
      case 'contact-method': setStep('trades'); break
      case 'phone': setStep('contact-method'); break
      case 'contact-detail': setStep('contact-method'); break
      case 'properties':
        setStep(contactMethod === 'email' ? 'contact-detail' : 'phone')
        break
    }
  }

  const handleNameNext = () => {
    if (!contractorName.trim()) {
      setError('Enter a name')
      return
    }
    setError(null)
    setStep('trades')
  }

  const handleTradesNext = () => {
    if (categories.length === 0) {
      setError('Select at least one trade')
      return
    }
    setError(null)
    setStep('contact-method')
  }

  const handleContactMethodSelect = (method: 'whatsapp' | 'email') => {
    setContactMethod(method)
    setStep(method === 'whatsapp' ? 'phone' : 'contact-detail')
  }

  const handlePhoneNext = () => {
    if (!phone.trim()) {
      setError('Enter a phone number')
      return
    }
    if (!isValidUKPhone(phone)) {
      setError('Enter a valid UK phone number')
      return
    }
    setError(null)
    setStep('properties')
  }

  const handleEmailNext = () => {
    if (!email.trim()) {
      setError('Enter an email address')
      return
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address')
      return
    }
    setError(null)
    setStep('properties')
  }

  const handleSubmit = async () => {
    if (!propertyManager) return
    setSaving(true)
    setError(null)

    try {
      const normalized = normalizeRecord('contractors', {
        contractor_name: contractorName,
        contractor_phone: phone,
        contractor_email: contactMethod === 'email' ? email : null,
      })

      const { error: insertError } = await supabase
        .from('c1_contractors')
        .insert({
          ...normalized,
          category: categories[0] || '',
          categories,
          contact_method: contactMethod,
          active: true,
          property_ids: selectedPropertyIds.length > 0 ? selectedPropertyIds : null,
          property_manager_id: propertyManager.id,
        })

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }

      toast.success('Contractor added')
      setStep('summary')
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const handleDismiss = async () => {
    if (propertyManager) localStorage.setItem(`contractor_setup_dismissed_${propertyManager.id}`, 'true')
    await refreshPM()
    setDismissing(true)
    setTimeout(() => {
      router.push('/')
    }, 600)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        dismissing ? 'bg-black/0 backdrop-blur-0' : 'bg-black/40 backdrop-blur-sm'
      }`}
    >
      <div
        className={`w-full max-w-lg px-4 transition-all duration-500 relative ${
          dismissing ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-8 z-10 w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        {/* Intro */}
        {step === 'intro' && (
          <div className="bg-card rounded-2xl border border-border p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Wrench className="w-8 h-8 text-primary" />
            </div>
            <h2 className={`${typography.pageTitle} text-center`}>
              Add your first contractor
            </h2>
            <p className={`${typography.bodyText} text-center mt-3 mb-8 max-w-xs mx-auto`}>
              So Yarro can dispatch repairs automatically.
            </p>
            <Button onClick={() => setStep('name')} size="lg" className="w-full">
              Start now
            </Button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center justify-center gap-2 mt-6 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <Upload className="w-4 h-4" />
              Bulk upload from CSV
            </button>
            <BulkImportDialog
              entityType="contractors"
              open={importOpen}
              onOpenChange={(open) => {
                setImportOpen(open)
                if (!open) window.location.reload()
              }}
            />
          </div>
        )}

        {/* Steps with back button */}
        {step !== 'intro' && step !== 'summary' && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            {/* Header: back button */}
            <div className="flex items-center px-6 pt-6 pb-2">
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1" />
              <div className="w-8" />
            </div>

            <div className="px-10 pb-10 pt-4">
              {/* Name */}
              {step === 'name' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    What&apos;s the company or tradesperson name?
                  </h2>
                  <div className="mt-8">
                    <Input
                      value={contractorName}
                      onChange={(e) => setContractorName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
                      placeholder="e.g. ABC Plumbing"
                      className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleNameNext() } }}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
                  <Button onClick={handleNameNext} className="w-full mt-8" size="lg">
                    Continue
                  </Button>
                </>
              )}

              {/* Trades */}
              {step === 'trades' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    What trades does {firstName} cover?
                  </h2>
                  <div className="mt-6 grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto">
                    {CONTRACTOR_CATEGORIES.map(cat => (
                      <ToggleOptionButton
                        key={cat}
                        label={cat}
                        selected={categories.includes(cat)}
                        onClick={() => toggleCategory(cat)}
                      />
                    ))}
                  </div>
                  {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
                  <Button onClick={handleTradesNext} className="w-full mt-6" size="lg">
                    Continue
                  </Button>
                </>
              )}

              {/* Phone */}
              {step === 'phone' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    What&apos;s {firstName}&apos;s phone number?
                  </h2>
                  <div className="mt-8">
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 07456789123"
                      className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePhoneNext() } }}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
                  <Button onClick={handlePhoneNext} className="w-full mt-8" size="lg">
                    Continue
                  </Button>
                </>
              )}

              {/* Contact Method */}
              {step === 'contact-method' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    How should Yarro contact {firstName}?
                  </h2>
                  <div className="mt-8 space-y-3">
                    <OnboardingOptionButton label="WhatsApp" onClick={() => handleContactMethodSelect('whatsapp')} />
                    <OnboardingOptionButton label="Email" onClick={() => handleContactMethodSelect('email')} />
                  </div>
                </>
              )}

              {/* Email (only if contact method is email) */}
              {step === 'contact-detail' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    What&apos;s {firstName}&apos;s email?
                  </h2>
                  <div className="mt-8">
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. contractor@email.com"
                      type="email"
                      className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEmailNext() } }}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
                  <Button onClick={handleEmailNext} className="w-full mt-8" size="lg">
                    Continue
                  </Button>
                </>
              )}

              {/* Properties */}
              {step === 'properties' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    Which properties should {firstName} cover?
                  </h2>
                  {loadingProperties ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : allProperties.length === 0 ? (
                    <p className={`${typography.bodyText} text-center mt-6 mb-4`}>
                      No properties added yet — you can assign properties later.
                    </p>
                  ) : (
                    <>
                      {allProperties.length > 1 && (
                        <button
                          onClick={() => {
                            if (selectedPropertyIds.length === allProperties.length) {
                              setSelectedPropertyIds([])
                            } else {
                              setSelectedPropertyIds(allProperties.map(p => p.id))
                            }
                          }}
                          className="text-sm text-primary hover:text-primary/70 transition-colors mt-4 mb-2"
                        >
                          {selectedPropertyIds.length === allProperties.length ? 'Clear all' : 'Select all'}
                        </button>
                      )}
                      <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
                        {allProperties.map(prop => (
                          <ToggleOptionButton
                            key={prop.id}
                            label={prop.address.split(',')[0]}
                            selected={selectedPropertyIds.includes(prop.id)}
                            onClick={() => toggleProperty(prop.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
                  <Button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="w-full mt-6"
                    size="lg"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Add contractor
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        {step === 'summary' && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="px-10 pt-8 pb-2">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </div>
            <div className="px-10 pb-10 pt-4">
              <h2 className={`${typography.pageTitle} text-center`}>
                Contractor added
              </h2>
              <p className={`${typography.bodyText} text-center mt-1 mb-6`}>
                {contractorName}
              </p>

              <div className="space-y-2 mb-8">
                {/* Trades */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border/50">
                  <Wrench className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Trades</p>
                    <p className="text-sm font-medium text-foreground">{categories.join(', ')}</p>
                  </div>
                </div>

                {/* Contact */}
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border/50">
                  {contactMethod === 'whatsapp'
                    ? <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {contactMethod === 'whatsapp' ? 'WhatsApp' : 'Email'}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {contactMethod === 'whatsapp' ? phone : email}
                    </p>
                  </div>
                </div>

                {/* Properties */}
                {selectedPropertyIds.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border/50">
                    <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Properties</p>
                      <p className="text-sm font-medium text-foreground">
                        {selectedPropertyIds.length} propert{selectedPropertyIds.length === 1 ? 'y' : 'ies'} assigned
                      </p>
                    </div>
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
